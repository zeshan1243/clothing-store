from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import DocumentCounter

QATAR_TZ = ZoneInfo("Asia/Qatar")


def next_document_number(db: Session, name: str, prefix: str) -> str:
    """Gap-free yearly sequence, e.g. ORD-2026-00001.

    The counter row stays locked until the caller's transaction commits or rolls back, so numbers
    are never reused and a rolled-back order doesn't leave a gap.
    """
    year = datetime.now(QATAR_TZ).year
    db.execute(
        insert(DocumentCounter)
        .values(name=name, year=year, last_value=0)
        .on_conflict_do_nothing(index_elements=["name", "year"])
    )
    counter = db.scalar(
        select(DocumentCounter)
        .where(DocumentCounter.name == name, DocumentCounter.year == year)
        .with_for_update()
    )
    counter.last_value += 1
    db.flush()
    return f"{prefix}-{year}-{counter.last_value:05d}"
