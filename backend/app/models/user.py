import enum
from sqlalchemy import String, Boolean, Enum
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class UserRole(str, enum.Enum):
    USER = "USER"
    CREATOR = "CREATOR"
    ADMIN = "ADMIN"

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str]
    
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole),
        default=UserRole.USER   # 👈 REGISTER KE TIME YEHI HOTA HAI
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)










# from sqlalchemy import String, Boolean, Enum
# from sqlalchemy.orm import Mapped, mapped_column, relationship
# import enum

# from app.db.base import Base


# class UserRole(str, enum.Enum):
#     USER = "USER"
#     CREATOR = "CREATOR"
#     ADMIN = "ADMIN"


# class User(Base):
#     __tablename__ = "users"

#     id: Mapped[int] = mapped_column(primary_key=True)
#     name: Mapped[str] = mapped_column(String(100))
#     email: Mapped[str] = mapped_column(String(150), unique=True, index=True)
#     hashed_password: Mapped[str] = mapped_column(String(255))
#     role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.USER)

#     # ✅ THIS WAS MISSING
#     creator = relationship(
#         "Creator",
#         back_populates="user",
#         uselist=False        
#     )
