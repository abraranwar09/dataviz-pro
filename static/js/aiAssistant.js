// AI Assistant Module
const aiAssistant = {
    elements: null,
    initialized: false,

    init() {
        try {
            // Prevent multiple initializations
            if (this.initialized) {
                return Promise.resolve();
            }

            // Re-query elements to ensure they're available
            this.elements = {
                chatContainer: document.getElementById('chat-container'),
                questionInput: document.getElementById('question-input'),
                sendButton: document.getElementById('send-button')
            };

            if (!this.elements.chatContainer) {
                throw new Error('Chat container element not found');
            }
            if (!this.elements.questionInput) {
                throw new Error('Question input element not found');
            }
            if (!this.elements.sendButton) {
                throw new Error('Send button element not found');
            }

            this.setupEventListeners();
            this.initialized = true;
            return Promise.resolve();
        } catch (error) {
            console.error('AI Assistant initialization error:', error);
            return Promise.reject(error);
        }
    },

    setupEventListeners() {
        // Remove any existing event listeners
        const newSendButton = this.elements.sendButton.cloneNode(true);
        this.elements.sendButton.parentNode.replaceChild(newSendButton, this.elements.sendButton);
        this.elements.sendButton = newSendButton;

        const newQuestionInput = this.elements.questionInput.cloneNode(true);
        this.elements.questionInput.parentNode.replaceChild(newQuestionInput, this.elements.questionInput);
        this.elements.questionInput = newQuestionInput;

        // Add event listeners
        this.elements.sendButton.addEventListener('click', () => this.handleQuestion());
        this.elements.questionInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleQuestion();
            }
        });

        // Handle data load events
        document.addEventListener('data-loaded', (event) => {
            const result = event.detail;
            const columns = result.columns || result.metadata?.column_names || [];
            const rows = result.data?.length || 0;

            if (result && !this.elements.chatContainer.querySelector('.assistant-message')) {
                this.addMessage('assistant', 
                    `I've loaded your data. I can see ${columns.length} columns and ${rows} rows. What would you like to know about it?`
                );
            }
        }, { once: true });
    },

    async handleQuestion() {
        try {
            const question = this.elements.questionInput?.value?.trim();
            if (!question) return;

            // Show loading indicator
            const queryProcessing = document.getElementById('queryProcessing');
            queryProcessing.style.display = 'block';

            // Clear input and show user message
            this.elements.questionInput.value = '';
            this.addMessage('user', question);

            if (!window.appState?.currentData?.data) {
                this.addMessage('assistant', 'Please upload a data file first');
                queryProcessing.style.display = 'none';
                return;
            }

            // Log the question and context data
            console.log('Sending question to AI assistant:', question);
            console.log('Context data:', {
                data: window.appState.currentData.data,
                columns: window.appState.currentData.columns,
                column_stats: window.appState.currentData.column_stats,
                summary: window.appState.currentData.summary
            });

            // Send request to AI assistant
            const response = await fetch('/visualize_data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question,
                    context: {
                        data: window.appState.currentData.data || [],
                        columns: window.appState.currentData.columns || [],
                        column_stats: window.appState.currentData.column_stats || {},
                        summary: window.appState.currentData.summary || {}
                    }
                })
            });

            const result = await response.json();
            console.log('Received response from AI assistant:', result);

            // Hide loading indicator
            queryProcessing.style.display = 'none';

            // Show assistant's response, filtering out JSON
            if (result.response && result.response.answer) {
                const cleanAnswer = result.response.answer.replace(/```json[\s\S]*?```/g, '')
                    .replace(/```[\s\S]*?```/g, '')
                    .trim();
                if (cleanAnswer) {
                    this.addMessage('assistant', cleanAnswer);
                }
            } else if (result.answer) {
                const cleanAnswer = result.answer.replace(/```json[\s\S]*?```/g, '')
                    .replace(/```[\s\S]*?```/g, '')
                    .trim();
                if (cleanAnswer) {
                    this.addMessage('assistant', cleanAnswer);
                }
            }

            // Update visualization if provided
            const visualization = result.response?.visualization || result.visualization;
            const vizType = result.response?.type || 'echarts';
            console.log('Visualization data:', visualization);
            console.log('Visualization type:', vizType);

            if (visualization) {
                const visualizationContainer = document.getElementById('visualizationContainer');
                visualizationContainer.classList.remove('d-none');

                if (vizType === 'html') {
                    visualizationContainer.innerHTML = visualization;
                } else {
                    updateVisualizations(visualization);
                }
            }

        } catch (error) {
            // Hide loading indicator on error
            document.getElementById('queryProcessing').style.display = 'none';
            console.error('Error:', error);
            this.addMessage('assistant', 'Sorry, I encountered an error. Please make sure your question is clear and the data is properly loaded.');
        }
    },

    createPieChartConfig(data, title) {
        return {
            title: {
                text: title,
                textStyle: { color: '#e9ecef' }
            },
            tooltip: {
                trigger: 'item',
                formatter: '{b}: {c} ({d}%)'
            },
            legend: {
                orient: 'horizontal',
                bottom: 'bottom',
                textStyle: { color: '#e9ecef' }
            },
            series: [{
                name: title,
                type: 'pie',
                radius: '70%',
                data: data.map(item => ({
                    name: item.label || item.name,
                    value: item.value
                })),
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                }
            }]
        };
    },

    createBarChartConfig(data, title) {
        return {
            title: {
                text: title,
                textStyle: { color: '#e9ecef' }
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' }
            },
            xAxis: {
                type: 'category',
                data: data.labels,
                axisLabel: { color: '#adb5bd' }
            },
            yAxis: {
                type: 'value',
                axisLabel: { color: '#adb5bd' }
            },
            series: [{
                type: 'bar',
                data: data.values,
                itemStyle: {
                    color: {
                        type: 'linear',
                        x: 0,
                        y: 0,
                        x2: 0,
                        y2: 1,
                        colorStops: [{
                            offset: 0,
                            color: '#3498db'
                        }, {
                            offset: 1,
                            color: '#2980b9'
                        }]
                    }
                }
            }]
        };
    },

    addMessage(type, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (typeof content === 'string') {
            // Configure marked options
            marked.setOptions({
                highlight: function(code, lang) {
                    if (lang && hljs.getLanguage(lang)) {
                        return hljs.highlight(code, { language: lang }).value;
                    }
                    return code;
                },
                breaks: true,
                gfm: true
            });

            // Convert hotkeys [1] through [6] into clickable spans
            let formattedContent = content.replace(/\[(\d)\]/g, (match, num) => {
                return `<span class="hotkey" data-query="${num}">[${num}]</span>`;
            });

            // Parse markdown
            contentDiv.innerHTML = marked.parse(formattedContent);

            // Add click handlers for hotkeys
            contentDiv.querySelectorAll('.hotkey').forEach(hotkey => {
                hotkey.addEventListener('click', () => {
                    const queryNum = hotkey.dataset.query;
                    const questionInput = document.getElementById('question-input');
                    if (questionInput) {
                        questionInput.value = queryNum;
                        this.handleQuestion();
                    }
                });
            });
        } else if (content.visualization) {
            // Handle visualization content
            const container = document.createElement('div');
            container.style.width = '100%';
            container.style.height = '400px';
            contentDiv.appendChild(container);
            const chart = echarts.init(container, 'dark');
            chart.setOption(content.visualization);
        } else if (content.text) {
            contentDiv.textContent = content.text;
        }

        messageDiv.appendChild(contentDiv);
        
        const chatContainer = this.elements.chatContainer;
        if (chatContainer) {
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        return messageDiv;
    }
};

// Initialize AI Assistant
document.addEventListener('DOMContentLoaded', () => {
    try {
        aiAssistant.init();
    } catch (error) {
        console.error('Error during AI Assistant initialization:', error);
    }
});

// Export for use in other modules
window.aiAssistant = aiAssistant;

// Assuming data is loaded into window.appState.currentData
function populateDataContext() {
    // Check if appState and currentData are defined
    if (!window.appState || !window.appState.currentData) {
        console.error('appState or currentData is not defined');
        return;
    }

    const data = window.appState.currentData.data || [];
    const metadata = window.appState.currentData.metadata || {};

    // Infer columns if not directly available
    const columns = window.appState.currentData.columns || metadata.column_names || Object.keys(data[0] || {});

    // Infer column stats if not available
    const columnStats = window.appState.currentData.column_stats || inferColumnStats(metadata);

    // Set the inferred or existing values
    window.appState.currentData.columns = columns;
    window.appState.currentData.column_stats = columnStats;
    window.appState.currentData.summary = window.appState.currentData.summary || generateSummary(data);

    console.log('Updated data context:', window.appState.currentData);
}

// Call this function after data is loaded
document.addEventListener('data-loaded', populateDataContext);
