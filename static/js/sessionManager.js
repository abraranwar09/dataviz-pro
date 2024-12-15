const sessionManager = {
    init() {
        this.setupEventListeners();
        this.loadSessions();
    },

    setupEventListeners() {
        document.getElementById('saveSession').addEventListener('click', () => this.saveCurrentSession());
        document.getElementById('sessionsDropdown').addEventListener('click', (e) => {
            if (e.target.classList.contains('session-item')) {
                this.loadSession(e.target.dataset.sessionId);
            }
        });
    },

    async saveCurrentSession() {
        try {
            const currentState = {
                data: window.appState.data,
                currentData: window.appState.currentData,
                columns: window.appState.columns,
                column_stats: window.appState.column_stats,
                chartInstances: window.chartInstances?.map(({config}) => config) || [],
                timestamp: new Date().toISOString()
            };

            const response = await fetch('/save_session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(currentState)
            });

            if (!response.ok) throw new Error('Failed to save session');

            const result = await response.json();
            this.loadSessions(); // Refresh sessions list
            this.showToast('Session saved successfully!');
        } catch (error) {
            console.error('Error saving session:', error);
            this.showToast('Failed to save session', 'error');
        }
    },

    async loadSessions() {
        try {
            const response = await fetch('/sessions');
            if (!response.ok) {
                console.warn('Sessions endpoint not available');
                this.updateSessionsDropdown([]);
                return;
            }

            const sessions = await response.json();
            if (!Array.isArray(sessions)) {
                console.warn('Invalid sessions response format');
                this.updateSessionsDropdown([]);
                return;
            }

            this.updateSessionsDropdown(sessions);
        } catch (error) {
            console.warn('Sessions functionality not available:', error);
            this.updateSessionsDropdown([]);
        }
    },

    async loadSession(sessionId) {
        try {
            const response = await fetch(`/load_session/${sessionId}`);
            if (!response.ok) throw new Error('Failed to load session');

            const session = await response.json();
            
            // Restore application state
            window.appState = {
                data: session.data.data,
                currentData: session.data.currentData,
                columns: session.data.columns,
                column_stats: session.data.column_stats,
                initialized: true,
                error: null
            };

            // Restore charts
            if (session.data.chartInstances) {
                window.chartInstances = [];
                session.data.chartInstances.forEach(config => {
                    const chart = echarts.init(document.getElementById(config.containerId));
                    chart.setOption(config.options);
                    window.chartInstances.push({ chart, config });
                });
            }

            // Update UI
            updateDataPreview(window.appState.currentData);
            updateColumnStats(window.appState.column_stats);
            this.showToast('Session loaded successfully!');
        } catch (error) {
            console.error('Error loading session:', error);
            this.showToast('Failed to load session', 'error');
        }
    },

    updateSessionsDropdown(sessions) {
        const dropdown = document.getElementById('sessionsDropdown');
        if (!sessions.length) {
            dropdown.innerHTML = '<div class="dropdown-item text-muted">No saved sessions</div>';
            return;
        }

        dropdown.innerHTML = sessions.map(session => `
            <a class="dropdown-item session-item" href="#" data-session-id="${session.session_id}">
                <i class="bi bi-clock-history me-2"></i>
                ${new Date(session.created_at).toLocaleString()}
            </a>
        `).join('');
    },

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-white bg-${type} border-0 position-fixed top-0 end-0 m-3`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;
        document.body.appendChild(toast);
        new bootstrap.Toast(toast).show();
        setTimeout(() => toast.remove(), 3000);
    }
};

// Initialize session manager when document is ready
document.addEventListener('DOMContentLoaded', () => sessionManager.init()); 