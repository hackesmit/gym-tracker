"""Global chat: user messages + system notifications (medal events, etc.)."""

from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import ChatMessage, User

router = APIRouter(prefix="/api/chat", tags=["chat"])


class SendPayload(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)


def _serialize(msg: ChatMessage, user_map: dict[int, User]) -> dict:
    author = user_map.get(msg.user_id) if msg.user_id else None
    return {
        "id": msg.id,
        "kind": msg.kind,
        "content": msg.content,
        "payload": msg.payload_json,
        "user_id": msg.user_id,
        "username": author.username if author else None,
        "name": author.name if author else None,
        "created_at": (
            msg.created_at.replace(tzinfo=timezone.utc).isoformat()
            if msg.created_at
            else None
        ),
    }


@router.get("")
def list_messages(
    after_id: int | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    limit = max(1, min(limit, 200))
    q = db.query(ChatMessage)
    if after_id is not None:
        q = q.filter(ChatMessage.id > after_id)
        msgs = q.order_by(ChatMessage.id.asc()).limit(limit).all()
    else:
        msgs = q.order_by(ChatMessage.id.desc()).limit(limit).all()
        msgs = list(reversed(msgs))
    user_ids = {m.user_id for m in msgs if m.user_id}
    user_map = (
        {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
        if user_ids
        else {}
    )
    return {"messages": [_serialize(m, user_map) for m in msgs]}


@router.post("", status_code=201)
def send_message(
    payload: SendPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Empty message")
    msg = ChatMessage(user_id=current_user.id, kind="user", content=content)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return _serialize(msg, {current_user.id: current_user})
