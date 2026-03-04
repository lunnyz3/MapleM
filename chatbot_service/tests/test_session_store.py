from datetime import timedelta

from chatbot_service.session_store import ChatSessionStore, to_iso, utc_now


def test_session_not_expired_before_ten_minutes():
    now = utc_now()
    session = {
        "expires_at": to_iso(now + timedelta(seconds=1)),
    }
    assert ChatSessionStore.is_expired(session, now=now) is False


def test_session_expired_at_ten_minutes_boundary():
    now = utc_now()
    session = {
        "expires_at": to_iso(now),
    }
    assert ChatSessionStore.is_expired(session, now=now) is True
