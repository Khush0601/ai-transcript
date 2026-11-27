from uuid import UUID, uuid4

from fastapi import Request

SESSION_ID_KEY = "client_id"


def get_client_id(request: Request) -> UUID:
    session_id = request.session.get(SESSION_ID_KEY)
    try:
        client_id = UUID(session_id) if isinstance(session_id, str) else None
    except ValueError:
        client_id = None

    if client_id is None:
        client_id = uuid4()
        request.session[SESSION_ID_KEY] = str(client_id)

    return client_id
