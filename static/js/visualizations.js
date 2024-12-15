// Visualization module for handling dynamic chart creation
let currentChart = null;
let resizeHandler = null;

function initializeCharts() {
    try {
        console.log('Initializing charts');
        // Initialize visualization system
        const container = document.getElementById('visualizationContainer');
        if (!container) {
            // Create container if it doesn't exist
            const mainContent = document.querySelector('.main-content') || document.body;
            const newContainer = document.createElement('div');
            newContainer.id = 'visualizationContainer';
            newContainer.className = 'chart-container mb-4';
            mainContent.appendChild(newContainer);
        }
        
        // Set up resize handler
        if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
        }
        
        resizeHandler = () => {
            if (currentChart) {
                currentChart.resize();
            }
        };
        
        window.addEventListener('resize', resizeHandler);
        console.log("Visualization system initialized successfully");
        return true;
    } catch (error) {
        console.error("Error initializing charts:", error.message);
        return false;
    }
}

function updateVisualizations(config) {
    // Register all ECharts themes
    echarts.registerTheme('dark', {
        backgroundColor: '#1a1a1a',
        textStyle: {
            color: '#e9ecef'
        }
    });
    try {
        const container = document.getElementById('visualizationContainer');
        if (!container) {
            throw new Error('Visualization container not found');
        }
        
        // Log the configuration being used
        console.log('Updating visualizations with config:', config);
        
        // Clean up existing chart
        cleanupCharts();
        container.innerHTML = '';
        
        // Create new chart div
        const chartDiv = document.createElement('div');
        chartDiv.style.width = '100%';
        chartDiv.style.height = '400px';
        chartDiv.classList.add('chart-container', 'loading');
        container.appendChild(chartDiv);
        
        // Initialize chart with dark theme
        currentChart = echarts.init(chartDiv, 'dark');
        
        // Enhanced responsive grid configuration
        const finalConfig = {
            ...config,
            backgroundColor: 'transparent',
            textStyle: { color: '#e9ecef' },
            title: {
                ...config.title,
                textStyle: { 
                    color: '#e9ecef',
                    fontSize: 14,
                    fontWeight: 500,
                    lineHeight: 20
                },
                top: 15,
                left: 'center',
                textAlign: 'center',
                padding: [5, 40]
            },
            grid: {
                top: 80,
                bottom: 70,
                left: '10%',
                right: '10%',
                containLabel: true
            },
            tooltip: {
                ...config.tooltip,
                confine: true,
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                textStyle: { color: '#fff' },
                padding: [8, 12]
            },
            legend: {
                ...config.legend,
                top: 'bottom',
                padding: [15, 0],
                textStyle: { color: '#e9ecef' }
            },
            animation: {
                duration: 1000,
                easing: 'cubicOut'
            }
        };
        console.log('Updating visualizations with config:', config);
        // Apply configuration with loading handling
        setTimeout(() => {
            currentChart.setOption(finalConfig);
            chartDiv.classList.remove('loading');
            // Auto-scroll to the new visualization
            chartDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
        
        // Enhanced responsive handler with debouncing
        const debouncedResize = debounce(() => {
            if (currentChart) {
                currentChart.resize({
                    animation: {
                        duration: 300,
                        easing: 'cubicOut'
                    }
                });
            }
        }, 250);
        
        window.addEventListener('resize', debouncedResize);
        resizeHandler = debouncedResize;
        
        return true;
    } catch (error) {
        console.error('Error updating visualization:', error);
        if (container) {
            container.innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle-fill me-2"></i>
                    Error creating chart: ${error.message}
                </div>`;
        }
        return false;
    }
}

function cleanupCharts() {
    try {
        console.log('Cleaning up existing charts');
        if (currentChart) {
            currentChart.dispose();
            currentChart = null;
        }
        if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
            resizeHandler = null;
        }
        return true;
    } catch (error) {
        console.error('Error cleaning up charts:', error.message);
        return false;
    }
}

// Add debounce utility
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Export necessary functions to global scope
window.updateVisualizations = updateVisualizations;
window.initializeCharts = initializeCharts;
window.cleanupCharts = cleanupCharts;