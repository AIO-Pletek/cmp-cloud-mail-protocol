from pydantic import BaseModel, EmailStr, Field, ConfigDict


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    
    accessToken: str = Field(alias="access_token")
    refreshToken: str = Field(alias="refresh_token")
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    company: str | None = None


class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=8, max_length=128)
