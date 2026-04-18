from typing import Optional, Type, Literal
import backoff
from langfuse.openai import AsyncOpenAI
from pydantic import BaseModel
from pydantic import create_model
from pydantic.fields import FieldInfo
import jiter
from langchain_core.output_parsers import PydanticOutputParser
import openai
import instructor
from api.utils.logging import logger

# Test log message
logger.info("Logging system initialized")


def is_reasoning_model(model: str) -> bool:
    if not model:
        return False

    for model_family in ["o3", "o1", "o1", "o4", "gpt-5"]:
        if model_family in model:
            return True

    return False


@backoff.on_exception(backoff.expo, Exception, max_tries=5, factor=2)
async def stream_llm_with_instructor(
    model: str,
    messages: list,
    response_model: BaseModel,
    max_completion_tokens: int,
    **kwargs,
):
    client = instructor.from_openai(openai.AsyncOpenAI())

    if not kwargs and not is_reasoning_model(model):
        kwargs["temperature"] = 0

    return client.chat.completions.create_partial(
        model=model,
        messages=messages,
        response_model=response_model,
        stream=True,
        max_completion_tokens=max_completion_tokens,
        store=True,
        **kwargs,
    )


# This function takes any Pydantic model and creates a new one
# where all fields are optional, allowing for partial data.
def create_partial_model(model: Type[BaseModel]) -> Type[BaseModel]:
    """
    Dynamically creates a Pydantic model where all fields of the original model
    are converted to Optional and have a default value of None.
    """
    new_fields = {}
    for name, field_info in model.model_fields.items():
        # Create a new FieldInfo with Optional type and a default of None
        new_field_info = FieldInfo.from_annotation(Optional[field_info.annotation])
        new_field_info.default = None
        new_fields[name] = (new_field_info.annotation, new_field_info)

    # Create the new model with the same name prefixed by "Partial"
    return create_model(f"Partial{model.__name__}", **new_fields)


@backoff.on_exception(backoff.expo, Exception, max_tries=5, factor=2)
async def stream_llm_with_openai(
    model: str,
    messages: list[dict],
    response_model: BaseModel,
    max_output_tokens: int,
    api_mode: Literal["responses", "chat_completions"] = "responses",
    **kwargs,
):
    client = AsyncOpenAI()

    partial_model = create_partial_model(response_model)

    if not kwargs and not is_reasoning_model(model):
        kwargs["temperature"] = 0

    if api_mode == "responses":
        stream = client.responses.stream(
            model=model,
            input=messages,
            text_format=response_model,
            max_output_tokens=max_output_tokens,
            store=True,
            metadata={},
            **kwargs,
        )
    else:
        if "-audio-" in model:
            # hack for audio as current audio models do not support response_format
            output_parser = PydanticOutputParser(pydantic_object=response_model)
            format_instructions = output_parser.get_format_instructions()

            messages[0]["content"] = (
                messages[0]["content"] + f"\n\nOutput format:\n{format_instructions}"
            )

            async for stream in await stream_llm_with_instructor(
                model=model,
                messages=messages,
                response_model=response_model,
                max_completion_tokens=max_output_tokens,
                **kwargs,
            ):
                yield stream

            return
        else:
            stream = client.chat.completions.stream(
                model=model,
                messages=messages,
                response_format=response_model,
                max_completion_tokens=max_output_tokens,
                store=True,
                n=1,
                **kwargs,
            )

    async with stream as stream:
        json_buffer = ""
        async for event in stream:
            if api_mode == "responses":
                if event.type == "response.output_text.delta":
                    # Get the content delta from the chunk
                    content = event.delta or ""
                    if not content:
                        continue

                    json_buffer += content

                    # Use jiter to parse the potentially incomplete JSON string.
                    # We wrap this in a try-except block to handle cases where the buffer
                    # is not yet a parsable JSON fragment (e.g., just whitespace or a comma).
                    try:
                        # 'trailing-strings' mode allows jiter to parse incomplete strings at the end of the JSON.
                        parsed_data = jiter.from_json(
                            json_buffer.encode("utf-8"), partial_mode="trailing-strings"
                        )

                        # Validate the partially parsed data against our dynamic partial model.
                        # `strict=False` allows for some type coercion, which is helpful here.
                        partial_obj = partial_model.model_validate(
                            parsed_data, strict=False
                        )
                        yield partial_obj
                    except:
                        # The buffer isn't a valid partial JSON object yet, so we wait for more chunks.
                        continue
            else:
                if event.type == "chunk":
                    content = event.snapshot.choices[0].message.content
                    if not content:
                        continue

                    # Use jiter to parse the potentially incomplete JSON string.
                    # We wrap this in a try-except block to handle cases where the buffer
                    # is not yet a parsable JSON fragment (e.g., just whitespace or a comma).
                    try:
                        # 'trailing-strings' mode allows jiter to parse incomplete strings at the end of the JSON.
                        parsed_data = jiter.from_json(
                            content.encode("utf-8"), partial_mode="trailing-strings"
                        )

                        # Validate the partially parsed data against our dynamic partial model.
                        # `strict=False` allows for some type coercion, which is helpful here.
                        partial_obj = partial_model.model_validate(
                            parsed_data, strict=False
                        )
                        yield partial_obj
                    except:
                        # The buffer isn't a valid partial JSON object yet, so we wait for more chunks.
                        continue
                elif event.type == "error":
                    raise event.error
                elif event.type == "content.done":
                    yield event.parsed


import json
from api.models import SmartFeedback

@backoff.on_exception(backoff.expo, Exception, max_tries=5, factor=2)
async def generate_smart_feedback(
    solution_code: str,
    problem_statement: str,
    evaluation_criteria: dict,
    ai_resources: dict,
    submission_type: str,
    attempt_number: int,
    previous_feedback: Optional[dict] = None,
) -> SmartFeedback:
    """
    Generate accurate AI smart feedback based on the provided problem context and criteria.
    """
    system_prompt = f"""
You are a precise code and text evaluator for an educational platform called SensAI.

STRICT RULES:
1. You must ONLY evaluate the submission against the EXACT problem statement provided below.
2. Do NOT reference any other problem, concept, or topic not mentioned in the problem statement.
3. If the problem says "sum of numbers", evaluate ONLY for sum logic. Never mention factorial, fibonacci, or any unrelated concept.
4. Every piece of feedback MUST quote directly from the learner's actual submitted code or text.
5. If the submission is empty or irrelevant, say so explicitly — do not fabricate feedback.

PROBLEM STATEMENT:
{problem_statement}

EVALUATION CRITERIA:
{json.dumps(evaluation_criteria, indent=2)}

AI TRAINING RESOURCES (use as reference context only, do not reveal to learner):
{json.dumps(ai_resources, indent=2)}

SUBMISSION TYPE: {submission_type}
ATTEMPT NUMBER: {attempt_number}
{"PREVIOUS FEEDBACK: " + json.dumps(previous_feedback) if previous_feedback else "FIRST ATTEMPT"}

Analyze the submission below against the problem statement and criteria ONLY.
Return ONLY valid JSON with no markdown, no extra text, following this structure:
{{
  "overall_score": <number 0-100>,
  "pass_status": <boolean>,
  "overall_summary": "<brief summary>",
  "criteria_feedback": [ 
    {{ 
      "criterion": "<criterion name from rubric>", 
      "score": <number>, 
      "has_issue": <true|false>,
      "socratic_question": "<guiding question per criterion to help the learner think>",
      "evidence": {{ 
        "line_number": <line number in code or step number in text, null if not applicable>, 
        "quoted_text": "<exact line/sentence copied from the submission>", 
        "issue": "<what specifically is wrong with that line/sentence>" 
      }}, 
      "explanation": "<why this fails the criterion>", 
      "suggestion": "<exact fix — show corrected code or corrected sentence>", 
      "confidence": "high|medium|low" 
    }} 
  ], 
  "socratic_nudge": "<overall socratic question>",
  "learning_gaps": ["<gap 1>", "<gap 2>"],
  "next_steps": ["<step 1>", "<step 2>"]
}}
"""
    
    user_prompt = f"LEARNER SUBMISSION:\n```\n{solution_code}\n```"

    try:
        # We can reuse the existing run_llm_with_openai logic but with this custom prompt
        result = await run_llm_with_openai(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_model=SmartFeedback,
            max_output_tokens=1500, # Increased for detailed feedback
            api_mode="chat_completions"
        )
        return result
    except Exception as e:
        logger.error(f"Error generating smart feedback: {e}")
        # Fallback empty feedback
        return SmartFeedback(
            overall_score=0,
            pass_status=False,
            overall_summary="Could not generate AI feedback at this time.",
            criteria_feedback=[],
            socratic_nudge="Can you explain your approach again?",
            learning_gaps=["Feedback generation error"],
            next_steps=["Please try submitting again in a few moments."]
        )

@backoff.on_exception(backoff.expo, Exception, max_tries=5, factor=2)
async def run_llm_with_openai(
    model: str,
    messages: list[dict],
    response_model: BaseModel,
    max_output_tokens: int,
    api_mode: Literal["responses", "chat_completions"] = "responses",
    **kwargs,
):
    client = AsyncOpenAI()

    if not kwargs and not is_reasoning_model(model):
        kwargs["temperature"] = 0

    if api_mode == "responses":
        response = await client.responses.parse(
            model=model,
            input=messages,
            text_format=response_model,
            max_output_tokens=max_output_tokens,
            store=True,
            **kwargs,
        )

        return response.output_parsed

    if "-audio-" in model:
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_completion_tokens=max_output_tokens,
            store=True,
            **kwargs,
        )

        return response.choices[0].message.content

    response = await client.chat.completions.parse(
        model=model,
        messages=messages,
        response_format=response_model,
        max_completion_tokens=max_output_tokens,
        store=True,
        **kwargs,
    )

    return response.choices[0].message.parsed
