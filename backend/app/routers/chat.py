"""Global chat: user messages + system notifications (medal events, etc.)."""

from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import ChatMessage, User

router = APIRouter(prefix="/api/chat", tags=["chat"])


class SendPayload(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)
    room: str = Field("general", min_length=1, max_length=64)


def _serialize(msg: ChatMessage, user_map: dict[int, User]) -> dict:
    author = user_map.get(msg.user_id) if msg.user_id else None
    return {
        "id": msg.id,
        "kind": msg.kind,
        "content": msg.content,
        "room": msg.room or "general",
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


@router.get("/rooms")
def list_rooms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return distinct rooms ordered by most-recently-active, limit 50.

    Always includes 'general' even if it has no messages yet.
    """
    rows = (
        db.query(
            ChatMessage.room,
            func.count(ChatMessage.id).label("message_count"),
            func.max(ChatMessage.created_at).label("last_message_at"),
        )
        .filter(ChatMessage.room.isnot(None))
        .group_by(ChatMessage.room)
        .order_by(func.max(ChatMessage.created_at).desc())
        .limit(50)
        .all()
    )

    rooms = []
    seen_general = False
    for row in rows:
        name = row.room or "general"
        if name == "general":
            seen_general = True
        # Fetch last message preview
        last_msg = (
            db.query(ChatMessage)
            .filter(ChatMessage.room == name)
            .order_by(ChatMessage.id.desc())
            .first()
        )
        preview = ""
        if last_msg:
            preview = last_msg.content[:80] + ("…" if len(last_msg.content) > 80 else "")
        rooms.append({
            "name": name,
            "message_count": row.message_count,
            "last_message_at": (
                row.last_message_at.replace(tzinfo=timezone.utc).isoformat()
                if row.last_message_at
                else None
            ),
            "last_message_preview": preview,
        })

    # Ensure general is always present at the top
    if not seen_general:
        rooms.insert(0, {
            "name": "general",
            "message_count": 0,
            "last_message_at": None,
            "last_message_preview": "",
        })
    else:
        # Move general to the front
        general_entry = next((r for r in rooms if r["name"] == "general"), None)
        if general_entry:
            rooms = [general_entry] + [r for r in rooms if r["name"] != "general"]

    return {"rooms": rooms}


@router.get("")
def list_messages(
    after_id: int | None = None,
    limit: int = 100,
    room: str = "general",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    limit = max(1, min(limit, 200))
    q = db.query(ChatMessage).filter(ChatMessage.room == room)
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
    room = payload.room.strip() or "general"
    msg = ChatMessage(user_id=current_user.id, kind="user", content=content, room=room)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return _serialize(msg, {current_user.id: current_user})
