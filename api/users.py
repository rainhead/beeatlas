"""upsert_user against the 178-02 users table (D-07/D-08/D-09).

`upsert_user` mints BeeAtlas's own internal integer id on first login and
returns the same internal id on every subsequent login, keyed on iNat
login (D-09) — the committed allowlist authorizes by login before the
internal id exists. The iNat numeric id is captured/refreshed alongside for
robustness against a login rename.

Callers pass a SQLAlchemy engine (tests use a tmp-path
`notes_store.db.make_engine`; route code in 178-06 passes the app's real
engine).
"""

import datetime

from sqlalchemy.orm import Session

from notes_store.models import User


def upsert_user(engine, inat_login: str, inat_user_id: int) -> int:
    """Insert or update the User row for *inat_login*; return its internal id."""
    now = datetime.datetime.now(datetime.UTC)
    with Session(engine) as session:
        user = session.query(User).filter_by(inat_login=inat_login).one_or_none()
        if user is None:
            user = User(
                inat_login=inat_login,
                inat_user_id=inat_user_id,
                created_at=now,
                updated_at=now,
            )
            session.add(user)
        else:
            user.inat_user_id = inat_user_id
            user.updated_at = now
        session.commit()
        return user.id
