from fastapi import APIRouter, Depends, HTTPException
from api.models import MentorChatRequest, MentorChatResponse, PracticeAssignment, EvaluationResult, SmartFeedback
from api.mentorService import generateMentorResponse
from api.utils.db import get_new_db_connection
from api.db import practice_assignments_table_name, assignment_submissions_table_name
import json

router = APIRouter()

@router.post("/mentor/chat", response_model=MentorChatResponse)
async def mentor_chat(request: MentorChatRequest):
    """
    Handles chat interactions with the AI mentor.
    Provides context-aware guidance to the student.
    """
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()

        # Fetch assignment details
        await cursor.execute(
            f"""SELECT id, title, description, input_format, expected_output, language, input_type
                FROM {practice_assignments_table_name}
                WHERE id = ?""", (request.assignment_id,)
        )
        assignment_row = await cursor.fetchone()
        if not assignment_row:
            raise HTTPException(status_code=404, detail="Assignment not found.")
        
        assignment = PracticeAssignment(
            id=assignment_row[0],
            title=assignment_row[1],
            description=assignment_row[2],
            input_format=assignment_row[3],
            expected_output=assignment_row[4],
            language=assignment_row[5],
            input_type=assignment_row[6]
        )

        # Fetch the latest submission for evaluation and smart feedback
        # This assumes previous_feedback in request is the *last* smart feedback
        # and evaluation_result is the *last* basic evaluation.
        # For simplicity, we'll use the provided previous_feedback and construct a dummy evaluation result
        # if not explicitly provided in the request.
        
        # In a real scenario, you might fetch the latest submission from DB
        # to ensure the context is always fresh and not reliant on frontend state.
        
        # For now, we'll use the provided previous_feedback and assume the request also contains
        # the latest basic evaluation result. If not, we'd need to fetch it.
        
        # Let's assume the request.previous_feedback contains the full SmartFeedback object
        # and we need to extract the basic evaluation from it or from a separate field.
        # For this implementation, we'll assume request.evaluation_result is also passed.
        
        # To get the latest evaluation result, we need to fetch the latest submission
        await cursor.execute(
            f"""SELECT score, status, feedback FROM {assignment_submissions_table_name}
                WHERE assignment_id = ? AND user_identifier = ?
                ORDER BY submitted_at DESC LIMIT 1""",
            (request.assignment_id, request.user_id) # Assuming user_id is the user_identifier
        )
        latest_submission_row = await cursor.fetchone()
        if not latest_submission_row:
            raise HTTPException(status_code=404, detail="No submissions found for this user and assignment. Please submit your code first.")
        
        # Safely parse feedback
        raw_feedback = latest_submission_row[2]
        try:
            feedback_list = json.loads(raw_feedback) if raw_feedback else []
        except:
            feedback_list = [str(raw_feedback)] if raw_feedback else []

        evaluation_result = EvaluationResult(
            score=latest_submission_row[0] or 0,
            status=latest_submission_row[1] or "fail",
            feedback=feedback_list
        )

        # Call the mentor service
        response = await generateMentorResponse(
            user_question=request.user_question,
            solution_code=request.solution_code,
            assignment=assignment,
            evaluation_result=evaluation_result,
            smart_feedback=request.previous_feedback, # Use the provided previous_feedback
            chat_history=request.chat_history
        )
        return response
