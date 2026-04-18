import json
from typing import List, Dict, Optional
from api.models import SmartFeedback, MentorChatMessage, MentorChatResponse, PracticeAssignment, EvaluationResult
from api.llm import run_llm_with_openai
from api.utils.logging import logger

from pydantic import BaseModel

class MentorReply(BaseModel):
    reply: str

async def generateMentorResponse(
    user_question: str,
    solution_code: str,
    assignment: PracticeAssignment,
    evaluation_result: EvaluationResult,
    smart_feedback: Optional[SmartFeedback],
    chat_history: List[MentorChatMessage]
) -> MentorChatResponse:
    """
    Generates an AI mentor response based on the user's question and context.
    """
    
    system_prompt = """
    You are an AI programming mentor named SensAI. Your goal is to help students understand their code, identify issues, and guide them towards solutions without giving away the complete answer.
    You are encouraging, precise, and always refer to the provided context.

    STRICT RULES:
    1. Focus ONLY on the provided assignment, student's code, and feedback.
    2. Do NOT introduce external concepts unless directly relevant to the student's question and the problem.
    3. Provide step-by-step guidance and hints, but NEVER give the full solution directly.
    4. If the student asks for the solution, gently guide them to think through the problem themselves.
    5. Maintain a supportive and encouraging tone.
    6. If the question is unclear or out of context, ask for clarification.
    7. Your response should be concise and directly address the student's query.
    
    Return ONLY valid JSON with the field "reply".
    """

    # ... (rest of the context construction)

    # Construct the current context for the AI
    context_parts = [
        f"Assignment Title: {assignment.title}",
        f"Assignment Description: {assignment.description}",
        f"Student's Current Code:\n```\n{solution_code}\n```",
        f"Basic Evaluation Result: Score {evaluation_result.score}/100, Status: {evaluation_result.status}, Feedback: {json.dumps(evaluation_result.feedback)}",
    ]

    if smart_feedback:
        context_parts.append(f"AI Smart Feedback:\n{smart_feedback.model_dump_json(indent=2)}")
    
    # Build the conversation history for the LLM
    llm_messages = [{"role": "system", "content": system_prompt}]
    for msg in chat_history:
        # OpenAI expects "assistant" for AI responses, but our model uses "ai"
        role = "assistant" if msg.role == "ai" else "user"
        llm_messages.append({"role": role, "content": msg.content})
    
    llm_messages.append({"role": "user", "content": f"Context:\n{'\n'.join(context_parts)}\n\nStudent's Question: {user_question}"})

    try:
        # Using gpt-4o-mini for chat as it's cost-effective and good for conversational tasks
        ai_response = await run_llm_with_openai(
            model="gpt-4o-mini",
            messages=llm_messages,
            response_model=MentorReply,
            max_output_tokens=500,
            api_mode="chat_completions"
        )

        ai_response_content = ai_response.reply

        # Append AI's reply to the chat history
        new_chat_history = chat_history + [
            MentorChatMessage(role="user", content=user_question),
            MentorChatMessage(role="ai", content=ai_response_content)
        ]

        return MentorChatResponse(reply=ai_response_content, chat_history=new_chat_history)

    except Exception as e:
        logger.error(f"Error generating mentor response: {e}")
        error_reply = "I'm sorry, I'm having trouble connecting to the AI mentor right now. Please try again later."
        new_chat_history = chat_history + [
            MentorChatMessage(role="user", content=user_question),
            MentorChatMessage(role="ai", content=error_reply)
        ]
        return MentorChatResponse(reply=error_reply, chat_history=new_chat_history)
