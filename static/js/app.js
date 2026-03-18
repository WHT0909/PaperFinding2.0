const API_BASE = '/api';
let currentPage = 1;
let currentQuery = '';
let totalPages = 1;
let currentYearFilter = 'all';
let currentPerPage = 10;
let allArticles = [];

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    
    searchBtn.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    const dateFilterRadios = document.querySelectorAll('input[name="dateFilter"]');
    dateFilterRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentYearFilter = e.target.value;
            filterArticlesByDate();
        });
    });
    
    const paperNumFilterRadios = document.querySelectorAll('input[name="paperNumFilter"]');
    paperNumFilterRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentPerPage = parseInt(e.target.value);
            if (currentQuery) {
                currentPage = 1;
                performSearch(currentQuery, currentPage, currentPerPage);
            }
        });
    });
    
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('q');
    if (query) {
        searchInput.value = query;
        currentQuery = query;
        performSearch(query, 1, currentPerPage);
    }
});

function handleSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) {
        alert('请输入搜索关键词');
        return;
    }
    currentQuery = query;
    currentPage = 1;
    performSearch(query, currentPage, currentPerPage);
}

async function performSearch(query, page, perPage = 10) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsList = document.getElementById('resultsList');
    const loading = document.getElementById('loading');
    const noResults = document.getElementById('noResults');
    const resultCount = document.getElementById('resultCount');
    const pagination = document.getElementById('pagination');
    
    resultsSection.style.display = 'block';
    noResults.style.display = 'none';
    resultsList.innerHTML = '';
    loading.style.display = 'block';
    pagination.innerHTML = '';
    
    try {
        const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`);
        
        if (!response.ok) {
            throw new Error('搜索请求失败');
        }
        
        const data = await response.json();
        loading.style.display = 'none';
        
        if (data.articles && data.articles.length > 0) {
            resultCount.textContent = `共找到 ${data.total_count} 篇文献`;
            totalPages = Math.ceil(data.total_count / perPage);
            
            allArticles = data.articles;
            filterArticlesByDate();
            
            renderPagination(page, totalPages);
        } else {
            noResults.style.display = 'block';
        }
    } catch (error) {
        loading.style.display = 'none';
        console.error('搜索错误:', error);
        noResults.innerHTML = '<p>搜索出错，请稍后重试</p>';
        noResults.style.display = 'block';
    }
}

function filterArticlesByDate() {
    const resultsList = document.getElementById('resultsList');
    resultsList.innerHTML = '';
    
    const currentYear = new Date().getFullYear();
    let filterYear;
    
    if (currentYearFilter === 'all') {
        filterYear = 0;
    } else {
        filterYear = currentYear - parseInt(currentYearFilter);
    }
    
    let filteredCount = 0;
    
    allArticles.forEach(article => {
        let pubYear = currentYear;
        if (article.pub_date) {
            const dateMatch = article.pub_date.match(/(\d{4})/);
            if (dateMatch) {
                pubYear = parseInt(dateMatch[1]);
            }
        }
        
        if (pubYear >= filterYear) {
            const card = createArticleCard(article);
            resultsList.appendChild(card);
            filteredCount++;
        }
    });
    
    const resultCount = document.getElementById('resultCount');
    if (currentYearFilter === 'all') {
        resultCount.textContent = `共找到 ${allArticles.length} 篇文献`;
    } else {
        resultCount.textContent = `显示 ${filteredCount} 篇文献（近 ${currentYearFilter} 年）`;
    }
}

function createArticleCard(article) {
    const card = document.createElement('div');
    card.className = 'article-card';
    
    const doiLink = article.doi 
        ? `<a href="https://doi.org/${article.doi}" target="_blank" class="doi-link">DOI: ${article.doi}</a>` 
        : '';
    
    const authors = article.authors && article.authors.length > 0 
        ? article.authors.slice(0, 5).join(', ') + (article.authors.length > 5 ? ' et al.' : '')
        : 'Unknown';
    
    card.innerHTML = `
        <a href="/article/${article.pmid}" class="article-title">${article.title}</a>
        <div class="article-meta">
            <span><strong>作者:</strong> ${authors}</span>
            <span><strong>期刊:</strong> ${article.journal || 'Unknown'}</span>
            <span><strong>日期:</strong> ${article.pub_date || 'Unknown'}</span>
        </div>
        <p class="article-abstract">${article.abstract || '暂无摘要'}</p>
        <span class="read-more">显示更多</span>
        <div class="article-footer">
            <a href="/article/${article.pmid}" class="pmid-link">PMID: ${article.pmid}</a>
            ${doiLink}
        </div>
    `;
    
    const readMore = card.querySelector('.read-more');
    const abstract = card.querySelector('.article-abstract');
    
    readMore.addEventListener('click', () => {
        abstract.classList.toggle('expanded');
        readMore.textContent = abstract.classList.contains('expanded') ? '收起' : '显示更多';
    });
    
    return card;
}

function renderPagination(currentPage, totalPages) {
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) return;
    
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    
    if (endPage - startPage + 1 < maxVisible) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }
    
    if (currentPage > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '上一页';
        prevBtn.addEventListener('click', () => {
            performSearch(currentQuery, currentPage - 1, currentPerPage);
        });
        pagination.appendChild(prevBtn);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        if (i === currentPage) {
            pageBtn.classList.add('active');
        }
        pageBtn.addEventListener('click', () => {
            performSearch(currentQuery, i, currentPerPage);
        });
        pagination.appendChild(pageBtn);
    }
    
    if (currentPage < totalPages) {
        const nextBtn = document.createElement('button');
        nextBtn.textContent = '下一页';
        nextBtn.addEventListener('click', () => {
            performSearch(currentQuery, currentPage + 1, currentPerPage);
        });
        pagination.appendChild(nextBtn);
    }
    
    const pageInfo = document.createElement('span');
    pageInfo.className = 'page-info';
    pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页`;
    pagination.appendChild(pageInfo);
}
