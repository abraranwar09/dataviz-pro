// Main application initialization
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize app state
        window.appState = {
            currentData: null,
            data: null,
            columns: [],
            column_stats: {},
            initialized: false,
            error: null
        };

        // Initialize components in sequence with proper error handling
        // Only initialize visualizations if explicitly needed
        window.initializeVisualizations = async function() {
            try {
                if (window.visualizationTools && typeof window.visualizationTools.initializeCharts === 'function') {
                    await window.visualizationTools.initializeCharts();
                    console.log('Charts initialized successfully');
                    return true;
                } else {
                    console.log('Visualization tools not needed yet');
                    return false;
                }
            } catch (error) {
                console.error('Failed to initialize charts:', error);
                // Don't show error to user as visualizations are optional
                return false;
            }
        };

        // Initialize other components without requiring visualizations

        try {
            await initializeFileHandlers();
            console.log('File handlers initialized');
        } catch (error) {
            console.error('Failed to initialize file handlers:', error);
            showError('File handling initialization failed');
        }

        // Initialize AI Assistant
        if (typeof window.aiAssistant !== 'undefined') {
            try {
                await window.aiAssistant.init();
                console.log('AI Assistant initialized');
            } catch (error) {
                console.error('Failed to initialize AI Assistant:', error);
                showError('AI Assistant initialization failed');
            }
        }

        // Initialize search functionality
        try {
            const searchInput = document.getElementById('tableSearch');
            if (searchInput) {
                initializeTableSearch();
                console.log('Search functionality initialized');
            }
        } catch (error) {
            console.error('Failed to initialize search:', error);
            showError('Search initialization failed');
        }

        // Add event listener for data loading to enable session buttons
        document.addEventListener('data-loaded', () => {
            document.getElementById('saveSession').disabled = false;
            // Share analysis feature temporarily disabled
            // document.getElementById('shareAnalysis').disabled = false;
        });

        window.appState.initialized = true;
        console.log('Application initialized successfully');

        // Set up error handler for uncaught promise rejections
        window.addEventListener('unhandledrejection', function(event) {
            console.error('Unhandled promise rejection:', event.reason);
            showError('An unexpected error occurred');
        });

    } catch (error) {
        console.error('Critical error during application initialization:', error);
        showError('Failed to initialize application. Please refresh the page.');
    }
});

function showError(message) {
    // Use the visualization tools error handler if available
    if (window.visualizationTools && typeof window.visualizationTools.showError === 'function') {
        window.visualizationTools.showError(message);
        return;
    }

    // Fallback error display
    const errorAlert = document.createElement('div');
    errorAlert.className = 'alert alert-danger alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3';
    errorAlert.style.zIndex = '1050';
    errorAlert.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="bi bi-exclamation-triangle-fill me-2"></i>
            <span>${message}</span>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(errorAlert);

    setTimeout(() => {
        errorAlert.remove();
    }, 5000);
}

// Export necessary functions
window.appUtils = {
    showError
};
