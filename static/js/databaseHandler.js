// Database handler functionality
async function initializeDatabaseHandler() {
    // Start connection sequence immediately
    startConnectionSequence();
}

async function startConnectionSequence() {
    const steps = document.querySelectorAll('.connection-step');
    const progressBar = document.getElementById('connectionProgress');
    const statusIndicator = document.getElementById('connectionIndicator');
    const statusText = document.getElementById('connectionStatus');
    
    // Initialize all steps
    steps.forEach(step => step.style.opacity = '0');
    
    try {
        // Step 1: Initialize
        await animateStep(0, steps, progressBar, 25);
        
        // Step 2: Validate
        await animateStep(1, steps, progressBar, 50);
        
        // Step 3: Load Schema
        await animateStep(2, steps, progressBar, 75);
        
        // Actual data loading
        const response = await fetch('/upload', {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error(await response.text() || 'Database connection failed');
        }

        const result = await response.json();
        console.log('Server response:', result);

        if (!result || !result.data) {
            throw new Error('Invalid database response format');
        }

        // Step 4: Complete
        await animateStep(3, steps, progressBar, 100);
        
        // Update connection status
        statusIndicator.classList.remove('connecting');
        statusIndicator.classList.add('connected');
        statusText.textContent = 'Connected';
        
        // Store data in global state
        window.appState = {
            ...window.appState,
            currentData: result,
            data: result.data || [],
            columns: result.columns || [],
            column_stats: result.column_stats || {}
        };

        // Update UI components
        updateDataPreview(result);
        updateDataStats(result);
        generateInitialVisualizations(result);

        // Dispatch data loaded event
        document.dispatchEvent(new CustomEvent('data-loaded', { 
            detail: result 
        }));

    } catch (error) {
        console.error('Connection error:', error);
        statusIndicator.classList.remove('connecting');
        statusIndicator.classList.add('error');
        statusText.textContent = 'Connection failed';
        showError(error.message || 'Failed to establish database connection');
    }
}

async function animateStep(stepIndex, steps, progressBar, progressValue) {
    return new Promise(resolve => {
        setTimeout(() => {
            steps[stepIndex].classList.add('active');
            steps[stepIndex].style.opacity = '1';
            if (progressBar) {
                progressBar.style.width = `${progressValue}%`;
            }
            // Add artificial delay for visual effect
            setTimeout(resolve, 800);
        }, 500);
    });
}

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', initializeDatabaseHandler); 