from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from pydantic import BaseModel, Field
from typing import List, Optional

from app.core.deps import get_current_user
from app.models.user import User
from app.services.rag_service import rag_service

router = APIRouter()


class CollectionCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=64, pattern="^[a-zA-Z0-9_-]+$")


class QueryRequest(BaseModel):
    collection_name: str
    query: str
    top_k: Optional[int] = Field(5, ge=1, le=50)


@router.get("/collections", response_model=List[str])
async def list_collections(current_user: User = Depends(get_current_user)):
    return rag_service.list_collections()


@router.post("/collections", status_code=status.HTTP_201_CREATED)
async def create_collection(
    data: CollectionCreate,
    current_user: User = Depends(get_current_user),
):
    try:
        return rag_service.create_collection(data.name)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/collections/{name}")
async def delete_collection(
    name: str,
    current_user: User = Depends(get_current_user),
):
    try:
        return rag_service.delete_collection(name)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/upload")
async def upload_document(
    collection_name: str = Query(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    try:
        content = await file.read()
        res = await rag_service.ingest_document(
            collection_name=collection_name,
            filename=file.filename,
            content=content
        )
        return res
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/query")
async def query_rag(
    data: QueryRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        results = await rag_service.hybrid_query(
            collection_name=data.collection_name,
            query=data.query,
            top_k=data.top_k
        )
        return {"results": results}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
