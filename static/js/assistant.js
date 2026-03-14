const API_BASE = '/api';

let conversationHistory = [];

// 初始化
function init() {
    document.getElementById('analyzeBtn').addEventListener('click', handleAnalyze);
    document.getElementById('clearBtn').addEventListener('click', handleClear);
    document.getElementById('sendBtn').addEventListener('click', handleSendMessage);
    document.getElementById('chatInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleSendMessage();
        }
    });
    
    document.getElementById('pdfUpload').addEventListener('change', handleFileUpload);
}

// 处理文件上传
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file) {
        document.getElementById('fileInfo').textContent = `已选择: ${file.name}`;
    }
}

// 处理分析按钮
async function handleAnalyze() {
    const textInput = document.getElementById('textInput').value.trim();
    const fileInput = document.getElementById('pdfUpload').files[0];
    
    if (!textInput && !fileInput) {
        alert('请输入文本或上传PDF文件');
        return;
    }
    
    addMessage('user', textInput || '上传了PDF文件');
    
    try {
        showLoading();
        
        let response;
        if (fileInput) {
            // 处理PDF上传
            const formData = new FormData();
            formData.append('file', fileInput);
            
            response = await fetch(`${API_BASE}/assistant/analyze-pdf`, {
                method: 'POST',
                body: formData
            });
        } else {
            // 处理文本分析
            response = await fetch(`${API_BASE}/assistant/analyze-text`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: textInput })
            });
        }
        
        if (!response.ok) {
            throw new Error('分析请求失败');
        }
        
        const data = await response.json();

        console.log('【分析文献】DeepSeek 原始回复：', data.response);
        console.log('【分析文献】完整返回数据：', data);

        addMessage('assistant', data.response);
        conversationHistory.push({ role: 'assistant', content: data.response });
    } catch (error) {
        console.error('分析失败:', error);
        addMessage('assistant', '分析失败，请稍后重试');
    } finally {
        hideLoading();
    }
}

// 处理发送消息
async function handleSendMessage() {
    const message = document.getElementById('chatInput').value.trim();
    if (!message) return;
    
    addMessage('user', message);
    document.getElementById('chatInput').value = '';
    
    try {
        showLoading();
        
        const response = await fetch(`${API_BASE}/assistant/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                history: conversationHistory
            })
        });
        
        if (!response.ok) {
            throw new Error('对话请求失败');
        }
        
        const data = await response.json();
        addMessage('assistant', data.response);
        conversationHistory.push({ role: 'user', content: message });
        conversationHistory.push({ role: 'assistant', content: data.response });
    } catch (error) {
        console.error('对话失败:', error);
        addMessage('assistant', '对话失败，请稍后重试');
    } finally {
        hideLoading();
    }
}

// 处理清空
function handleClear() {
    document.getElementById('textInput').value = '';
    document.getElementById('pdfUpload').value = '';
    document.getElementById('fileInfo').textContent = '';
    document.getElementById('chatHistory').innerHTML = '<div class="system-message"><p>您好！我是文献助手，可以帮助您分析文献内容、提取创新点、回答相关问题。请输入文献内容或上传PDF文件。</p></div>';
    conversationHistory = [];
}

// Markdown转HTML的核心函数
function markdownToHtml(markdown) {
    if (!markdown) return '';
    let html = markdown;
    // 1. 标题处理 (# -> h1, ## -> h2 直到 ### h3，可扩展)
    html = html.replace(/^#{1} (.*$)/gm, '<h1>$1</h1>');
    html = html.replace(/^#{2} (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^#{3} (.*$)/gm, '<h3>$1</h3>');
    // 2. 粗体处理 (** **)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // 3. 斜体处理 (* *)
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // 4. 链接处理 ([文本](链接))
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    // 5. 无序列表处理 (- /*)
    html = html.replace(/^(\s*)- (.*$)/gm, '$1<ul><li>$2</li></ul>');
    // 合并连续的ul标签
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    // 6. 有序列表处理 (1. / 2. )
    html = html.replace(/^(\s*\d+)\. (.*$)/gm, '$1<ol><li>$2</li></ol>');
    // 合并连续的ol标签
    html = html.replace(/<\/ol>\s*<ol>/g, '');
    // 7. 代码块处理 (``` ```)
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    // 8. 行内代码处理 (` `)
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');
    // 9. 换行处理
    html = html.replace(/\n/g, '<br>');
    // 10. 引用处理 (> )
    html = html.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');
    return html;
}

// 添加消息到聊天历史
function addMessage(role, content) {
    const chatHistory = document.getElementById('chatHistory');
    const messageDiv = document.createElement('div');
    messageDiv.className = role === 'user' ? 'user-message' : 'assistant-message';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    // 区分角色：助手消息解析Markdown，用户消息纯文本
    if (role === 'assistant') {
        messageContent.innerHTML = markdownToHtml(content);
    } else {
        messageContent.textContent = content;
    }
    
    messageDiv.appendChild(messageContent);
    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// 显示加载状态
function showLoading() {
    const chatHistory = document.getElementById('chatHistory');
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loading';
    loadingDiv.className = 'loading-message';
    loadingDiv.textContent = 'AI 正在分析...';
    chatHistory.appendChild(loadingDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// 隐藏加载状态
function hideLoading() {
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', init);
