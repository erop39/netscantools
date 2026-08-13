from pydantic import BaseModel, field_validator


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str

    model_config = {"from_attributes": True}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        value = (v or "").strip()
        if len(value) < 6:
            raise ValueError("New password must be at least 6 characters")
        return value
