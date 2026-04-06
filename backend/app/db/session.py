import importlib.util

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import DEFAULT_SQLITE_DB, settings


_engine = None
_sessionmaker = None


def _resolve_database_url() -> str:
    database_url = settings.database_url

    if database_url.startswith("postgresql+asyncpg"):
        if importlib.util.find_spec("asyncpg") is not None:
            return database_url
        if importlib.util.find_spec("aiosqlite") is not None:
            return f"sqlite+aiosqlite:///{DEFAULT_SQLITE_DB}"
        raise RuntimeError(
            "No async database driver is installed. Install 'asyncpg' for PostgreSQL "
            "or 'aiosqlite' for SQLite."
        )

    if database_url.startswith("sqlite+aiosqlite"):
        if importlib.util.find_spec("aiosqlite") is None:
            raise RuntimeError(
                "The configured SQLite URL requires 'aiosqlite', but it is not installed."
            )
        return database_url

    return database_url


def get_engine():
    global _engine

    if _engine is None:
        _engine = create_async_engine(
            _resolve_database_url(),
            echo=settings.debug,
            future=True,
        )

    return _engine


def get_session_factory():
    global _sessionmaker

    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(
            get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )

    return _sessionmaker


class _AsyncSessionLocalProxy:
    def __call__(self):
        return get_session_factory()()


AsyncSessionLocal = _AsyncSessionLocalProxy()


async def get_db():
    async with get_session_factory()() as session:
        yield session
