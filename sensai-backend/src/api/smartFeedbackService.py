import json
from typing import Optional
from api.models import SmartFeedback, EvaluationResult
from api.llm import run_llm_with_openai

async def generateSmartFeedback(solutionCode: str, evaluationResult: EvaluationResult, problem_desc: str) -> Optional[SmartFeedback]:
    """
    Analyze student solution using AI to provide detailed feedback and suggestions.
    """
    system_prompt = "You are an expert, encouraging programming mentor evaluating a student's solution."
    user_prompt = f"""
    Analyze the student's solution and provide deep, constructive feedback.

    Problem Statement: {problem_desc}
    Student's Code:
    ```
    {solutionCode}
    ```
    Evaluation Result Score: {evaluationResult.score}/100
    Base Feedback: {json.dumps(evaluationResult.feedback)}

    Identify:
    - Logical errors: Any flaws in the algorithm or implementation.
    - Missing edge cases: Scenarios the student might have missed (e.g., empty input, large numbers, etc.).
    - Inefficiency: Time or space complexity issues, or redundant operations.

    Provide a structured response with:
    1. detailedFeedback: A list of specific strings identifying issues or logical gaps.
    2. suggestions: A list of actionable tips to improve the code.
    """
    
    try:
        # Using gpt-4o-mini as a cost-effective but capable model for feedback
        result = await run_llm_with_openai(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_model=SmartFeedback,
            max_output_tokens=800,
            api_mode="chat_completions"
        )
        return result
    except Exception as e:
        print(f"Smart Feedback LLM failed: {e}")
        # Graceful fallback to the new model structure
        return SmartFeedback(
            overall_score=0,
            pass_status=False,
            overall_summary="AI feedback is currently unavailable. Please check your backend configuration.",
            criteria_feedback=[],
            socratic_nudge="Can you explain your approach again?",
            learning_gaps=["Feedback generation failed"],
            next_steps=["Please try submitting again in a few moments."]
        )
