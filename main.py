import os
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Query, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from Bio import Entrez
from settings import PUBMED_EMAIL, PUBMED_API_KEY, DEEPSEEK_API_KEY
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage, AIMessage
import PyPDF2
import io

Entrez.email = PUBMED_EMAIL
API_KEY = PUBMED_API_KEY if PUBMED_API_KEY else None

# 初始化DeepSeek模型
if DEEPSEEK_API_KEY:
    llm = ChatOpenAI(
        model="deepseek-chat",
        api_key=DEEPSEEK_API_KEY,
        base_url="https://api.deepseek.com/v1"
        # temperature=0.7
    )
else:
    llm = None

app = FastAPI(title="BioPapers API", description="文献检索系统后端API")

# 添加中间件，在每个特定的路径操作处理每个请求之前运行，也会在返回每个响应之前运行
app.add_middleware(
    CORSMiddleware,           # 跨域资源共享，解决前端和后端不在同一源下时的通信问题
    allow_origins=["*"],      # 允许的源
    allow_credentials=True,   # 启用跨域请求时支持 cookies
    allow_methods=["*"],      # 允许所有 HTTP 方法
    allow_headers=["*"],      # 允许所有请求头
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 将位于 static 目录下的静态文件提供给前端访问
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

class Article(BaseModel):
    pmid: str
    title: str
    authors: List[str]
    journal: str
    pub_date: str
    abstract: Optional[str] = None
    doi: Optional[str] = None

class SearchResult(BaseModel):
    total_count: int
    articles: List[Article]

def search_pubmed(query: str, start: int = 0, max_results: int = 10) -> SearchResult:
    try:
        handle = Entrez.esearch(
            db="pubmed",
            term=query,
            retmax=max_results,
            retstart=start,
            sort="relevance",
            retmode="xml",
            api_key=API_KEY
        )
        
        record = Entrez.read(handle)
        handle.close()
        
        id_list = record.get("IdList", [])
        total_count = int(record.get("Count", 0))
        
        if not id_list:
            return SearchResult(total_count=0, articles=[])
        
        articles = fetch_details_xml(id_list)
        
        return SearchResult(total_count=total_count, articles=articles)
        
    except Exception as e:
        print(f"Search error: {e}")
        import traceback
        traceback.print_exc()
        return SearchResult(total_count=0, articles=[])

def fetch_details_xml(pmids: List[str]) -> List[Article]:
    articles = []
    
    if not pmids:
        return articles
    
    try:
        handle = Entrez.efetch(
            db="pubmed",
            id=",".join(pmids),
            rettype="xml",
            retmode="xml",
            api_key=API_KEY
        )
        
        records = Entrez.read(handle)
        handle.close()
        
        for article in records.get('PubmedArticle', []):
            try:
                medline = article.get('MedlineCitation', {})
                
                pmid = str(medline.get('PMID', ''))
                article_data = medline.get('Article', {})
                title = article_data.get('ArticleTitle', 'No title')
                
                authors = []
                for author in article_data.get('AuthorList', []):
                    if isinstance(author, dict):
                        last_name = author.get('LastName', '')
                        fore_name = author.get('ForeName', '')
                        if last_name:
                            name = f"{fore_name} {last_name}".strip()
                            authors.append(name)
                
                journal_info = article_data.get('Journal', {})
                journal = journal_info.get('Title', '')
                
                journal_date = journal_info.get('JournalIssue', {}).get('PubDate', {})
                year = journal_date.get('Year', '')
                month = journal_date.get('Month', '')
                day = journal_date.get('Day', '')
                
                if year:
                    pub_date = f"{year}"
                    if month:
                        pub_date += f" {month}"
                    if day:
                        pub_date += f" {day}"
                else:
                    pub_date = ''
                
                abstract_data = article_data.get('Abstract', {})
                abstract_text = abstract_data.get('AbstractText', [])
                if isinstance(abstract_text, list):
                    abstract = ' '.join(abstract_text)
                else:
                    abstract = abstract_text
                
                id_list = article.get('PubmedData', {}).get('ArticleIdList', [])
                doi = None
                for id_item in id_list:
                    if hasattr(id_item, 'attributes') and id_item.attributes.get('IdType') == 'doi':
                        doi = str(id_item)
                        break
                
                articles.append(Article(
                    pmid=pmid,
                    title=title,
                    authors=authors,
                    journal=journal,
                    pub_date=pub_date,
                    abstract=abstract if abstract else None,
                    doi=doi
                ))
                
            except Exception as e:
                print(f"Error parsing article: {e}")
                continue
        
    except Exception as e:
        print(f"Error fetching details: {e}")
        import traceback
        traceback.print_exc()
    
    return articles

def get_article_by_pmid(pmid: str) -> Optional[Article]:
    articles = fetch_details_xml([pmid])
    return articles[0] if articles else None

@app.get("/", response_class=HTMLResponse)
async def root():
    with open(os.path.join(BASE_DIR, "templates", "index.html"), "r", encoding="utf-8") as f:
        return f.read()

@app.get("/about", response_class=HTMLResponse)
async def about():
    with open(os.path.join(BASE_DIR, "templates", "about.html"), "r", encoding="utf-8") as f:
        return f.read()

@app.get("/article/{pmid}", response_class=HTMLResponse)
async def article_detail(pmid: str):
    with open(os.path.join(BASE_DIR, "templates", "article.html"), "r", encoding="utf-8") as f:
        return f.read()

@app.get("/assistant", response_class=HTMLResponse)
async def assistant():
    with open(os.path.join(BASE_DIR, "templates", "assistant.html"), "r", encoding="utf-8") as f:
        return f.read()

@app.get("/api/search", response_model=SearchResult)
async def search(
    q: str = Query(..., description="搜索关键词"),
    page: int = Query(1, ge=1, description="页码"),
    per_page: int = Query(10, ge=1, le=50, description="每页结果数")
):
    if not q.strip():
        raise HTTPException(status_code=400, detail="搜索关键词不能为空")
    
    start = (page - 1) * per_page
    result = search_pubmed(q, start=start, max_results=per_page)
    return result

@app.get("/api/article/{pmid}")
async def get_article(pmid: str):
    article = get_article_by_pmid(pmid)
    if not article:
        raise HTTPException(status_code=404, detail="文献未找到")
    return article

# 文献助手相关API
class TextAnalysisRequest(BaseModel):
    text: str

class ChatRequest(BaseModel):
    message: str
    history: List[Dict[str, str]]

class AnalysisResponse(BaseModel):
    response: str

@app.post("/api/assistant/analyze-text", response_model=AnalysisResponse)
async def analyze_text(request: TextAnalysisRequest):
    if not llm:
        raise HTTPException(status_code=500, detail="DeepSeek API key not configured")
    
    try:
        prompt = ChatPromptTemplate.from_template("""
        你是一个专业的文献分析助手，请分析以下文献内容，总结其主要内容、创新点、研究方法和结论。
        
        文献内容：
        {text}
        
        请按照以下结构输出分析结果：
        1. 主要内容
        2. 创新点
        3. 研究方法
        4. 结论
        5. 潜在的研究方向
        """)
        
        chain = prompt | llm
        response = chain.invoke({"text": request.text})
        
        return AnalysisResponse(response=response.content)
    except Exception as e:
        print(f"Analysis error: {e}")
        raise HTTPException(status_code=500, detail="分析失败，请稍后重试")

@app.post("/api/assistant/analyze-pdf", response_model=AnalysisResponse)
async def analyze_pdf(file: UploadFile = File(...)):
    if not llm:
        raise HTTPException(status_code=500, detail="DeepSeek API key not configured")
    
    try:
        # 读取PDF文件
        content = await file.read()
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
        
        # 提取文本
        text = ""
        for page_num in range(len(pdf_reader.pages)):
            page = pdf_reader.pages[page_num]
            text += page.extract_text()
        
        if not text:
            raise HTTPException(status_code=400, detail="无法从PDF中提取文本")
        
        # 分析文本
        prompt = ChatPromptTemplate.from_template("""
        你是一个专业的文献分析助手，请分析以下PDF文献内容，总结其主要内容、创新点、研究方法和结论。
        
        文献内容：
        {text}
        
        请按照以下结构输出分析结果：
        1. 主要内容
        2. 创新点
        3. 研究方法
        4. 结论
        5. 潜在的研究方向
        """)
        
        chain = prompt | llm
        response = chain.invoke({"text": text})
        
        return AnalysisResponse(response=response.content)
    except Exception as e:
        print(f"PDF analysis error: {e}")
        raise HTTPException(status_code=500, detail="PDF分析失败，请稍后重试")

@app.post("/api/assistant/chat", response_model=AnalysisResponse)
async def chat(request: ChatRequest):
    if not llm:
        raise HTTPException(status_code=500, detail="DeepSeek API key not configured")
    
    try:
        # 构建对话历史
        messages = []
        for msg in request.history:
            if msg["role"] == "user":
                messages.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "assistant":
                messages.append(AIMessage(content=msg["content"]))
        
        # 添加当前消息
        messages.append(HumanMessage(content=request.message))
        
        # 生成回复
        response = llm.invoke(messages)
        
        return AnalysisResponse(response=response.content)
    except Exception as e:
        print(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail="对话失败，请稍后重试")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
