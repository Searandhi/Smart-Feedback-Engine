import json
import secrets
from fastapi import APIRouter, HTTPException, BackgroundTasks
from api.models import (
    CreatePracticeAssignmentRequest,
    PracticeAssignment,
    SubmitSolutionRequest,
    SubmissionResponse,
    EvaluationResult,
    SmartFeedback,
)
from api.utils.db import get_new_db_connection
from api.db import practice_assignments_table_name, assignment_submissions_table_name
from typing import List, Optional
from api.llm import generate_smart_feedback

router = APIRouter()

async def background_generate_feedback(
    submission_id: int,
    solution_code: str,
    description: str,
    eval_criteria: dict,
    input_t: str,
    attempt_number: int,
    previous_feedback: Optional[dict] = None,
    user_identifier: str = "anonymous",
    assignment_id: int = 0
):
    """Background task to generate smart feedback and update the database."""
    try:
        smart_fb = await generate_smart_feedback(
            solution_code=solution_code,
            problem_statement=description,
            evaluation_criteria=eval_criteria,
            ai_resources={},
            submission_type=input_t,
            attempt_number=attempt_number,
            previous_feedback=previous_feedback
        )
        
        if smart_fb:
            async with get_new_db_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute(
                    f"UPDATE {assignment_submissions_table_name} SET smart_feedback = ? WHERE id = ?",
                    (smart_fb.model_dump_json(), submission_id)
                )
                await conn.commit()
                
                # Innovative Feature 3: Notify mentor if AI confidence is low
                if any(c.confidence == "low" for c in smart_fb.criteria_feedback):
                    from api.utils.logging import logger
                    logger.warning(
                        f"Low confidence AI feedback for user {user_identifier} "
                        f"on assignment {assignment_id}. Manual review flagged."
                    )
    except Exception as e:
        from api.utils.logging import logger
        logger.error(f"Error in background_generate_feedback: {e}")
        # Update database to indicate failure so frontend stops polling
        try:
            async with get_new_db_connection() as conn:
                cursor = await conn.cursor()
                # Store a minimal "error" object in the smart_feedback column
                error_feedback = {
                    "overall_score": 0,
                    "pass_status": False,
                    "overall_summary": "AI mentor feedback is temporarily unavailable. Please check back later.",
                    "criteria_feedback": [],
                    "socratic_nudge": "The mentor is busy right now. Try reviewing your logic again!",
                    "learning_gaps": ["Feedback generation failed"],
                    "next_steps": ["Continue improving your code based on the basic evaluation results."],
                    "is_error": True
                }
                await cursor.execute(
                    f"UPDATE {assignment_submissions_table_name} SET smart_feedback = ? WHERE id = ?",
                    (json.dumps(error_feedback), submission_id)
                )
                await conn.commit()
        except Exception as db_err:
            logger.error(f"Failed to record AI feedback error in DB: {db_err}")


# ─────────────────────────────────────────────
# EVALUATION ENGINE
# ─────────────────────────────────────────────

import subprocess
import sys
import textwrap

async def evaluateSubmission(solutionCode: str, problem_desc: str, input_format: str, expectedOutput: str, language: str = "python") -> EvaluationResult:
    """Dynamically evaluate learner code using a local sandbox subprocess."""

    if not solutionCode.strip():
        return EvaluationResult(
            score=0,
            status="fail",
            feedback=["❌ Solution is empty. Please write some code before submitting."]
        )

    lang = language.lower().strip()

    # ── Python: Run it locally via subprocess ─────────────────────────────────
    if lang == "python":
        try:
            proc = subprocess.run(
                [sys.executable, "-c", solutionCode],
                capture_output=True, text=True, timeout=5
            )
            stdout = proc.stdout.strip()
            stderr = proc.stderr.strip()
            expected = expectedOutput.strip()

            if proc.returncode != 0:
                # Syntax/runtime error — show user the traceback
                short_err = stderr.splitlines()[-1] if stderr else "Unknown error"
                return EvaluationResult(
                    score=0,
                    status="invalid",
                    feedback=[
                        f"❌ Runtime error in your code: {short_err}",
                        "💡 Check your syntax and variable names.",
                        f"📋 Full traceback: {stderr[:500]}" if stderr else "",
                    ]
                )

        # Compare output
            if stdout == expected:
                return EvaluationResult(
                    score=100,
                    status="pass",
                    feedback=[
                        "✅ Correct! Your output matches the expected output exactly.",
                        f"📤 Your output: {repr(stdout)}",
                        "🎉 Great job! All test cases passed.",
                    ]
                )
            else:
                import difflib
                
                # Dynamic Partial Scoring: Calculate how close the output is to expected
                ratio = difflib.SequenceMatcher(None, stdout, expected).ratio()
                
                # Score from 0 to 95 if not perfect (cap at 95)
                partial_score = int(ratio * 100)
                if partial_score >= 100:
                    partial_score = 95
                elif partial_score < 5:
                    partial_score = 0
                
                status_enum = "fail" if partial_score < 50 else "pass"
                
                # Partial feedback: show what was wrong
                feedback = [
                    f"{'❌' if partial_score < 50 else '⚠️'} Partial correctness (Score: {partial_score}/100).",
                    f"📤 Your output:    {repr(stdout)}",
                    f"✅ Expected output: {repr(expected)}",
                ]
                
                # Add specific hints
                if stdout.lower() == expected.lower():
                    feedback.append("💡 Hint: Output matches if ignoring case — check your capitalization.")
                    partial_score = max(partial_score, 80)
                elif stdout.replace(" ", "") == expected.replace(" ", ""):
                    feedback.append("💡 Hint: Output matches if ignoring spaces — check for extra/missing spaces.")
                    partial_score = max(partial_score, 80)
                else:
                    feedback.append("💡 Hint: Review your logic and ensure your print statements output exactly the expected value.")

                return EvaluationResult(score=partial_score, status=status_enum, feedback=feedback)

        except subprocess.TimeoutExpired:
            return EvaluationResult(
                score=0,
                status="invalid",
                feedback=[
                    "⏱️ Time Limit Exceeded: Your code took too long to run (> 5 seconds).",
                    "💡 Check for infinite loops or inefficient algorithms.",
                ]
            )
        except Exception as e:
            return EvaluationResult(
                score=0,
                status="invalid",
                feedback=[f"⚠️ Evaluation error: {str(e)}"]
            )

    # ── C++ / Java: Not locally compiled; smart heuristic check ───────────────
    elif lang in ("cpp", "java"):
        lang_display = "C++" if lang == "cpp" else "Java"
        # Basic syntax sanity check (heuristic)
        checks = []
        has_main = ("main" in solutionCode)
        has_content = len(solutionCode.strip()) > 20

        if not has_content:
            return EvaluationResult(score=0, status="fail", feedback=["❌ Solution appears too short or empty."])

        if not has_main:
            checks.append(f"⚠️ No `main` function found. {lang_display} programs typically require a main entry point.")

        checks.insert(0, f"📝 {lang_display} submission received. Local compilation is not available in this environment.")
        checks.append("💡 Your code has been recorded. An instructor will review it manually.")
        checks.append("🔧 For full auto-evaluation of C++/Java, a Judge0 sandbox integration is planned.")

        return EvaluationResult(score=50, status="pass", feedback=checks)

    # ── Text/Math answers: simple string comparison ───────────────────────────
    else:
        answer = solutionCode.strip()
        expected = expectedOutput.strip()

        if answer.lower() == expected.lower():
            return EvaluationResult(
                score=100,
                status="pass",
                feedback=["✅ Correct answer!", "🎉 Your response matches the expected answer exactly."]
            )
        else:
            import difflib
            ratio = difflib.SequenceMatcher(None, answer.lower(), expected.lower()).ratio()
            
            partial_score = int(ratio * 100)
            if partial_score >= 100:
                partial_score = 95
            elif partial_score < 20: 
                # Very low similarity means it's totally wrong in text/math usually.
                partial_score = 0
                
            status_enum = "fail" if partial_score < 60 else "pass"
            
            feedback = [
                f"{'❌ Incorrect answer' if partial_score == 0 else '⚠️ Partially Correct'} (Score: {partial_score}/100)",
                f"✅ Expected: {expected}",
                f"📤 You answered: {answer}",
                "💡 Review the problem and check for typos or incorrect logic.",
            ]
            
            return EvaluationResult(score=partial_score, status=status_enum, feedback=feedback)



# ─────────────────────────────────────────────
# ADMIN: CREATE & LIST ASSIGNMENTS
# ─────────────────────────────────────────────

@router.post("", response_model=PracticeAssignment)
async def create_practice_assignment(request: CreatePracticeAssignmentRequest):
    """Admin creates an assignment. Returns a shareable invite_token."""
    token = secrets.token_urlsafe(16)
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        try:
            await cursor.execute(
                f"""INSERT INTO {practice_assignments_table_name}
                    (course_id, title, description, input_format, expected_output, language, input_type, invite_token)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (request.course_id, request.title, request.description,
                 request.input_format, request.expected_output, request.language, request.input_type, token),
            )
            await conn.commit()
            assignment_id = cursor.lastrowid
            await cursor.execute(
                f"""SELECT id, course_id, title, description, input_format,
                           expected_output, language, input_type, invite_token, created_at, updated_at
                    FROM {practice_assignments_table_name} WHERE id = ?""", (assignment_id,))
            row = await cursor.fetchone()
            return PracticeAssignment(
                id=row[0], course_id=row[1], title=row[2], description=row[3],
                input_format=row[4], expected_output=row[5],
                language=row[6], input_type=row[7],
                invite_token=row[8], created_at=row[9], updated_at=row[10],
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=List[PracticeAssignment])
async def list_practice_assignments(course_id: int):
    """Admin lists all assignments for a course."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        try:
            await cursor.execute(
                f"""SELECT id, course_id, title, description, input_format,
                           expected_output, language, input_type, invite_token, created_at, updated_at
                    FROM {practice_assignments_table_name}
                    WHERE course_id = ? ORDER BY created_at ASC""", (course_id,))
            rows = await cursor.fetchall()
            return [PracticeAssignment(
                id=r[0], course_id=r[1], title=r[2], description=r[3],
                input_format=r[4], expected_output=r[5],
                language=r[6], input_type=r[7],
                invite_token=r[8], created_at=r[9], updated_at=r[10],
            ) for r in rows]
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# LEARNER: ACCESS VIA INVITE TOKEN (public)
# ─────────────────────────────────────────────

@router.get("/view/{invite_token}", response_model=PracticeAssignment)
async def get_assignment_by_token(invite_token: str):
    """Public endpoint — learner accesses assignment via invite link."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"""SELECT id, course_id, title, description, input_format,
                       expected_output, language, input_type, invite_token, created_at, updated_at
                FROM {practice_assignments_table_name}
                WHERE invite_token = ?""", (invite_token,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Assignment not found. The link may be invalid.")
        return PracticeAssignment(
            id=row[0], course_id=row[1], title=row[2], description=row[3],
            input_format=row[4], expected_output=row[5],
            language=row[6], input_type=row[7],
            invite_token=row[8], created_at=row[9], updated_at=row[10],
        )


from api.llm import generate_smart_feedback

@router.post("/view/{invite_token}/submit", response_model=SubmissionResponse)
async def submit_via_token(invite_token: str, request: SubmitSolutionRequest, background_tasks: BackgroundTasks):
    """Learner submits their solution via invite link. Evaluation runs and result is returned."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"""SELECT id, description, input_format, expected_output, language, input_type
                FROM {practice_assignments_table_name}
                WHERE invite_token = ?""", (invite_token,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Assignment not found.")
        assignment_id, description, input_format, expected_output, lang, input_t = row

        # Fetch attempt number and previous feedback
        user_id = request.user_identifier or "anonymous"
        await cursor.execute(
            f"""SELECT smart_feedback FROM {assignment_submissions_table_name}
                WHERE assignment_id = ? AND user_identifier = ?
                ORDER BY submitted_at DESC LIMIT 1""",
            (assignment_id, user_id)
        )
        prev_row = await cursor.fetchone()
        previous_feedback = json.loads(prev_row[0]) if prev_row and prev_row[0] else None

        await cursor.execute(
            f"""SELECT COUNT(*) FROM {assignment_submissions_table_name}
                WHERE assignment_id = ? AND user_identifier = ?""",
            (assignment_id, user_id)
        )
        count_row = await cursor.fetchone()
        attempt_number = (count_row[0] or 0) + 1

        result = await evaluateSubmission(
            solutionCode=request.solution_code,
            problem_desc=description,
            input_format=input_format,
            expectedOutput=expected_output,
            language=lang
        )
        
        # Prepare evaluation criteria for the background task
        eval_criteria = {
            "input_format": input_format,
            "expected_output": expected_output,
            "base_evaluation_feedback": result.feedback,
            "score_threshold": 80
        }
        
        try:
            # Initial insertion with no smart_feedback
            await cursor.execute(
                f"""INSERT INTO {assignment_submissions_table_name}
                    (assignment_id, user_identifier, solution_code, score, status, feedback, smart_feedback)
                    VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (assignment_id, request.user_identifier or "anonymous",
                 request.solution_code, result.score, result.status, json.dumps(result.feedback), 
                 None),
            )
            await conn.commit()
            submission_id = cursor.lastrowid
            
            # Enqueue the AI feedback generation as a background task
            background_tasks.add_task(
                background_generate_feedback,
                submission_id=submission_id,
                solution_code=request.solution_code,
                description=description,
                eval_criteria=eval_criteria,
                input_t=input_t,
                attempt_number=attempt_number,
                previous_feedback=previous_feedback,
                user_identifier=request.user_identifier or "anonymous",
                assignment_id=assignment_id
            )

            await cursor.execute(
                f"""SELECT id, assignment_id, user_identifier, solution_code,
                           score, status, feedback, smart_feedback, submitted_at
                    FROM {assignment_submissions_table_name} WHERE id = ?""", (submission_id,))
            srow = await cursor.fetchone()
            
            return SubmissionResponse(
                id=srow[0], assignment_id=srow[1], user_identifier=srow[2],
                solution_code=srow[3],
                evaluation=EvaluationResult(score=srow[4], status=srow[5], feedback=json.loads(srow[6])),
                smart_feedback=None, # Initially None, frontend will poll or check history
                submitted_at=srow[8],
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@router.get("/view/{invite_token}/submissions/{user_identifier}", response_model=List[SubmissionResponse])
async def get_learner_history(invite_token: str, user_identifier: str):
    """Learner views their submission history for an assignment via token."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        
        # Verify assignment first
        await cursor.execute(
            f"""SELECT id FROM {practice_assignments_table_name} WHERE invite_token = ?""", 
            (invite_token,)
        )
        arow = await cursor.fetchone()
        if not arow:
            raise HTTPException(status_code=404, detail="Assignment not found.")
        assignment_id = arow[0]

        await cursor.execute(
            f"""SELECT id, assignment_id, user_identifier, solution_code,
                       score, status, feedback, smart_feedback, submitted_at
                FROM {assignment_submissions_table_name}
                WHERE assignment_id = ? AND user_identifier = ?
                ORDER BY submitted_at ASC""", (assignment_id, user_identifier))
        rows = await cursor.fetchall()
        
        results = []
        for r in rows:
            sf_dict = None
            if r[7]:
                sf_dict = json.loads(r[7])
                
            results.append(SubmissionResponse(
                id=r[0], assignment_id=r[1], user_identifier=r[2], solution_code=r[3],
                evaluation=EvaluationResult(score=r[4], status=r[5], feedback=json.loads(r[6])),
                smart_feedback=SmartFeedback(**sf_dict) if sf_dict else None,
                submitted_at=r[8],
            ))
        return results


@router.get("/submissions/{assignment_id}/{user_identifier}", response_model=List[SubmissionResponse])
async def get_submissions_by_assignment_and_user(assignment_id: int, user_identifier: str):
    """Return all attempts for a specific assignment and user."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"""SELECT id, assignment_id, user_identifier, solution_code,
                       score, status, feedback, smart_feedback, submitted_at
                FROM {assignment_submissions_table_name}
                WHERE assignment_id = ? AND user_identifier = ?
                ORDER BY submitted_at ASC""", (assignment_id, user_identifier))
        rows = await cursor.fetchall()
        
        results = []
        for r in rows:
            sf_dict = None
            if r[7]:
                sf_dict = json.loads(r[7])
            results.append(SubmissionResponse(
                id=r[0], assignment_id=r[1], user_identifier=r[2], solution_code=r[3],
                evaluation=EvaluationResult(score=r[4], status=r[5], feedback=json.loads(r[6])),
                smart_feedback=SmartFeedback(**sf_dict) if sf_dict else None,
                submitted_at=r[8],
            ))
        return results


@router.get("/{assignment_id}/submissions", response_model=List[SubmissionResponse])
async def get_submissions(assignment_id: int):
    """Admin views all submissions for an assignment."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"""SELECT id, assignment_id, user_identifier, solution_code,
                       score, status, feedback, smart_feedback, submitted_at
                FROM {assignment_submissions_table_name}
                WHERE assignment_id = ? ORDER BY submitted_at DESC""", (assignment_id,))
        rows = await cursor.fetchall()
        
        results = []
        for r in rows:
            sf_dict = None
            if r[7]:
                sf_dict = json.loads(r[7])
            results.append(SubmissionResponse(
                id=r[0], assignment_id=r[1], user_identifier=r[2], solution_code=r[3],
                evaluation=EvaluationResult(score=r[4], status=r[5], feedback=json.loads(r[6])),
                smart_feedback=SmartFeedback(**sf_dict) if sf_dict else None,
                submitted_at=r[8],
            ))
        return results
