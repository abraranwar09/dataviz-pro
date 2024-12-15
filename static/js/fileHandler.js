const ROWS_PER_PAGE = 10;
let currentPage = 1;
let filteredData = [];
let fullData = [];

function initializeFileHandlers() {
    const fileInput = document.querySelector('input[type="file"]');
    const dropZone = document.getElementById('dropZone');

    if (fileInput) {
        fileInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                try {
                    await handleFileUpload(file);
                } catch (error) {
                    console.error('File upload error:', error);
                }
            }
        });
    }

    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            
            const file = e.dataTransfer.files[0];
            if (file) {
                try {
                    await handleFileUpload(file);
                } catch (error) {
                    console.error('File drop error:', error);
                }
            }
        });

        // Handle click to upload
        dropZone.addEventListener('click', () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.csv';
            fileInput.style.display = 'none';
            
            fileInput.addEventListener('change', async (event) => {
                const file = event.target.files[0];
                if (file) {
                    try {
                        await handleFileUpload(file);
                    } catch (error) {
                        console.error('File selection error:', error);
                    }
                }
            });
            
            document.body.appendChild(fileInput);
            fileInput.click();
            document.body.removeChild(fileInput);
        });
    }
}

async function handleFileUpload(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Upload failed: ' + response.statusText);
        }

        const result = await response.json();
        if (!result || !result.data) {
            throw new Error('Invalid response format from server');
        }
        
        // Store data in global state
        window.appState = {
            ...window.appState,
            currentData: result,
            data: result.data || [],
            columns: result.columns || [],
            column_stats: result.column_stats || {}
        };

        // Update UI
        updateDataPreview(result);
        updateDataStats(result);
        generateInitialVisualizations(result);

        // Show success message
        showSuccess('File uploaded successfully!');

        // Dispatch a single custom event for data loading
        document.dispatchEvent(new CustomEvent('data-loaded', { 
            detail: result 
        }));

        return result;
    } catch (error) {
        console.error('Error uploading file:', error);
        showError(error.message || 'Failed to upload file. Please try again.');
        throw error;
    }
}

function initializeTableSearch() {
    const searchInput = document.getElementById('tableSearch');
    const table = document.getElementById('previewTable');
    
    if (!searchInput || !table) return;

    // Remove any existing event listener
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);

    newSearchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        const tbody = table.getElementsByTagName('tbody')[0];
        const rows = tbody.getElementsByTagName('tr');

        for (let row of rows) {
            let text = '';
            const cells = row.getElementsByTagName('td');
            for (let cell of cells) {
                text += cell.textContent + ' ';
            }
            
            if (text.toLowerCase().includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        }
    });
}

function updateDataPreview(data, showAll = false) {
    const table = document.getElementById('previewTable');
    if (!table) {
        console.error('Preview table element not found');
        return;
    }

    try {
        // Use metadata to infer columns and preview data
        const columns = data.metadata.column_names || [];
        const preview = showAll ? data.data : data.data.slice(0, 10); // Show all data if showAll is true

        console.log('Columns:', columns);
        console.log('Preview data:', preview);

        // Clear existing content
        table.innerHTML = '';

        // Create header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        columns.forEach(column => {
            const th = document.createElement('th');
            th.textContent = column;
            th.style.position = 'sticky';
            th.style.top = '0';
            th.style.backgroundColor = 'var(--bs-dark)';
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create body
        const tbody = document.createElement('tbody');
        preview.forEach(row => {
            const tr = document.createElement('tr');
            columns.forEach(column => {
                const td = document.createElement('td');
                td.textContent = row[column] !== undefined ? row[column] : '';
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);

        console.log('Data preview updated successfully');
    } catch (error) {
        console.error('Error updating data preview:', error);
        showError('Error displaying data preview');
    }
}

function showSuccess(message) {
    const successAlert = document.createElement('div');
    successAlert.className = 'alert alert-success alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3';
    successAlert.style.zIndex = '1050';
    successAlert.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="bi bi-check-circle-fill me-2"></i>
            <span>${message}</span>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(successAlert);

    setTimeout(() => {
        successAlert.remove();
    }, 3000);
}

function showError(message) {
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

async function handleFile(file) {
    const progressBar = document.querySelector('.progress-bar');
    const progressDiv = document.getElementById('uploadProgress');
    const errorAlert = document.getElementById('errorAlert');
    const shareButton = document.getElementById('shareAnalysis');

    // Reset UI state
    progressDiv.classList.add('d-none');
    errorAlert.classList.add('d-none');
    shareButton.disabled = true;

    // Client-side validation
    if (!file) {
        showError('Please select a file to upload');
        return;
    }

    // Check file size
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
        showError(`File size exceeds maximum limit of 50MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB`);
        return;
    }

    // Check if file is empty
    if (file.size === 0) {
        showError('The selected file is empty');
        return;
    }

    // Check file extension
    const allowedExtensions = ['csv', 'xlsx', 'xls', 'json', 'tsv', 'txt'];
    const extension = file.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(extension)) {
        showError(`Invalid file type. Allowed types are: ${allowedExtensions.join(', ')}`);
        return;
    }

    // Show progress bar
    progressDiv.classList.remove('d-none');
    progressBar.style.width = '0%';
    progressBar.setAttribute('aria-valuenow', 0);

    const formData = new FormData();
    formData.append('file', file);

    try {
        await displayFileContent(file);
        
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
        }

        const result = await response.json();
        
        // Update application state with structured data
        window.appState = {
            currentData: {
                data: result.data || [], // Ensure data is always an array
                preview: result.preview || [],
                columns: result.columns || [],
                column_stats: result.column_stats || {},
                summary: result.summary || {}
            }
        };
        
        // Update UI
        updateDataStats(result);
        updatePreviewTable(result.preview);
        
        // Generate automatic visualizations with full data
        generateInitialVisualizations(window.appState.fullData);
        
        shareButton.disabled = false;
        progressDiv.classList.add('d-none');

    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
    }
}

async function generateInitialVisualizations(data) {
    console.log('Data passed to generateInitialVisualizations:', data);

    const visualizationContainer = document.getElementById('visualizationContainer');
    const noVisualizationsMsg = document.getElementById('noVisualizationsMsg');
    
    try {
        // Use metadata to infer column types if column_stats is missing
        const columnStats = data.column_stats || inferColumnStats(data.metadata);
        
        const numericColumns = Object.entries(columnStats)
            .filter(([_, stats]) => stats.type === 'numeric')
            .map(([col, _]) => col);
        
        const categoricalColumns = Object.entries(columnStats)
            .filter(([_, stats]) => stats.type === 'categorical')
            .map(([col, _]) => col);

        noVisualizationsMsg.classList.add('d-none');
        visualizationContainer.classList.remove('d-none');
        visualizationContainer.innerHTML = ''; // Clear existing charts

        // Create different types of charts using full dataset
        if (numericColumns.length > 0) {
            // Distribution chart for first numeric column
            createChart(visualizationContainer, {
                title: {
                    text: `Distribution of ${numericColumns[0]}`,
                    textStyle: { color: '#e9ecef' }
                },
                backgroundColor: 'transparent',
                tooltip: {
                    trigger: 'axis',
                    backgroundColor: 'rgba(30, 32, 35, 0.9)',
                    borderColor: '#555',
                    textStyle: { color: '#fff' }
                },
                xAxis: {
                    type: 'category',
                    data: createBins(data.data.map(row => row[numericColumns[0]]), 10),
                    axisLabel: { color: '#adb5bd' }
                },
                yAxis: {
                    type: 'value',
                    axisLabel: { color: '#adb5bd' }
                },
                series: [{
                    type: 'bar',
                    data: calculateHistogram(data.data.map(row => row[numericColumns[0]]), 10),
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#3498db' },
                            { offset: 1, color: '#2980b9' }
                        ])
                    }
                }]
            });
        }

        if (numericColumns.length >= 2) {
            // Scatter plot for first two numeric columns
            createChart(visualizationContainer, {
                title: {
                    text: `${numericColumns[0]} vs ${numericColumns[1]}`,
                    textStyle: { color: '#e9ecef' }
                },
                backgroundColor: 'transparent',
                tooltip: {
                    trigger: 'item',
                    backgroundColor: 'rgba(30, 32, 35, 0.9)',
                    borderColor: '#555',
                    textStyle: { color: '#fff' }
                },
                xAxis: {
                    type: 'value',
                    name: numericColumns[0],
                    nameTextStyle: { color: '#adb5bd' },
                    axisLabel: { color: '#adb5bd' }
                },
                yAxis: {
                    type: 'value',
                    name: numericColumns[1],
                    nameTextStyle: { color: '#adb5bd' },
                    axisLabel: { color: '#adb5bd' }
                },
                series: [{
                    type: 'scatter',
                    data: data.data.map(row => [row[numericColumns[0]], row[numericColumns[1]]]),
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#2ecc71' },
                            { offset: 1, color: '#27ae60' }
                        ])
                    }
                }]
            });
        }

        if (categoricalColumns.length > 0) {
            // Bar chart for categorical data
            const categoryData = processCategories(data.data, categoricalColumns[0]);
            createChart(visualizationContainer, {
                title: {
                    text: `Distribution of ${categoricalColumns[0]}`,
                    textStyle: { color: '#e9ecef' }
                },
                backgroundColor: 'transparent',
                tooltip: {
                    trigger: 'axis',
                    backgroundColor: 'rgba(30, 32, 35, 0.9)',
                    borderColor: '#555',
                    textStyle: { color: '#fff' }
                },
                xAxis: {
                    type: 'category',
                    data: categoryData.categories,
                    axisLabel: {
                        color: '#adb5bd',
                        rotate: 45
                    }
                },
                yAxis: {
                    type: 'value',
                    axisLabel: { color: '#adb5bd' }
                },
                series: [{
                    type: 'bar',
                    data: categoryData.counts,
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#9b59b6' },
                            { offset: 1, color: '#8e44ad' }
                        ])
                    }
                }]
            });
        }

    } catch (error) {
        console.error('Error generating visualizations:', error);
        noVisualizationsMsg.classList.remove('d-none');
        visualizationContainer.classList.add('d-none');
    }

    // Handle expand/collapse button
    const expandCollapseButton = document.getElementById('expandAllStats');
    expandCollapseButton?.addEventListener('click', () => {
        const isExpanded = expandCollapseButton.textContent.includes('Collapse');
        
        // Toggle between showing all data and slicing data
        updateDataPreview(data, !isExpanded);

        // Update button text
        expandCollapseButton.innerHTML = isExpanded 
            ? '<i class="bi bi-arrows-angle-expand"></i> Expand All'
            : '<i class="bi bi-arrows-angle-contract"></i> Collapse';
    });
}

// Helper function to infer column stats from metadata
function inferColumnStats(metadata) {
    const columnStats = {};
    metadata.column_names.forEach(column => {
        // Simple inference logic based on column name or other metadata
        columnStats[column] = {
            type: metadata.categorical_columns.includes(column) ? 'categorical' : 'numeric'
        };
    });
    return columnStats;
}

function createChart(container, config) {
    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    chartContainer.style.width = '100%';
    chartContainer.style.height = '400px';
    container.appendChild(chartContainer);
    
    const chart = echarts.init(chartContainer, 'dark');
    chart.setOption(config);
    
    const resizeObserver = new ResizeObserver(() => {
        chart.resize();
    });
    resizeObserver.observe(chartContainer);
    
    if (!window.chartInstances) window.chartInstances = [];
    window.chartInstances.push({
        chart,
        container: chartContainer,
        resizeObserver
    });
}

// Helper functions
function createBins(data, binCount) {
    const validData = data.filter(v => v !== null && !isNaN(v));
    const min = Math.min(...validData);
    const max = Math.max(...validData);
    const binWidth = (max - min) / binCount;
    return Array(binCount).fill(0).map((_, i) => 
        `${(min + i * binWidth).toFixed(1)} - ${(min + (i + 1) * binWidth).toFixed(1)}`
    );
}

function calculateHistogram(data, binCount) {
    const validData = data.filter(v => v !== null && !isNaN(v));
    const min = Math.min(...validData);
    const max = Math.max(...validData);
    const binWidth = (max - min) / binCount;
    const bins = Array(binCount).fill(0);
    
    validData.forEach(value => {
        const binIndex = Math.min(Math.floor((value - min) / binWidth), binCount - 1);
        bins[binIndex]++;
    });
    
    return bins;
}

function processCategories(data, column) {
    const counts = {};
    data.forEach(row => {
        const value = row[column];
        counts[value] = (counts[value] || 0) + 1;
    });
    
    const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10); // Show top 10 categories
    
    return {
        categories: sorted.map(([cat]) => cat),
        counts: sorted.map(([_, count]) => count)
    };
}

function updateDataStats(data) {
    const statsDiv = document.getElementById('dataStats');

    // Log the entire data object for debugging
    console.log('Data object received:', data);

    // Extract metadata
    const metadata = data.metadata || {};
    const columnNames = metadata.column_names || [];
    const totalRows = metadata.rows || data.data.length;
    const totalColumns = columnNames.length;

    // Construct summary object
    const summary = {
        rows: totalRows,
        columns: totalColumns,
        memory_usage: `${(data.data.length * columnNames.length * 8 / 1024 / 1024).toFixed(2)} MB` // Rough estimate
    };

    const columnStats = data.column_stats || {};
    const preview = data.data; // Use the entire dataset for preview

    // Log the received data for debugging
    console.log('Summary:', summary);
    console.log('Column Stats:', columnStats);
    console.log('Preview Data:', preview);

    // Calculate metrics
    const qualityMetrics = calculateDataQuality(data);
    const distributionMetrics = calculateDistributionMetrics(data);

    // Log the calculated metrics
    console.log('Quality Metrics:', qualityMetrics);
    console.log('Distribution Metrics:', distributionMetrics);

    // Process the actual data for better insights
    const processedStats = {};
    Object.entries(columnStats).forEach(([column, stats]) => {
        if (stats.type === 'numeric') {
            const values = preview.map(row => parseFloat(row[column])).filter(v => !isNaN(v));
            processedStats[column] = {
                ...stats,
                values,
                actualStats: calculateColumnStatistics(values),
                patterns: detectPatterns(values, column),
                correlations: findCorrelations(column, preview, columnStats)
            };
        }
    });

    statsDiv.innerHTML = `
        <div class="data-stats-container">
            <!-- Overview Section -->
            <div class="stats-section mb-4">
                <h6 class="stats-header">
                    <i class="bi bi-clipboard-data me-2"></i>Dataset Overview
                    <span class="badge bg-${getHealthScoreClass(qualityMetrics.healthScore)} ms-2">
                        ${qualityMetrics.healthScore || 0}% Health
                    </span>
                </h6>
                <div class="row g-3">
                    <div class="col-md-3 col-sm-6">
                        <div class="stat-card">
                            <div class="stat-icon"><i class="bi bi-table"></i></div>
                            <div class="stat-details">
                                <small class="text-muted">Total Rows</small>
                                <div class="h5 mb-0">${summary.rows.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3 col-sm-6">
                        <div class="stat-card">
                            <div class="stat-icon"><i class="bi bi-columns"></i></div>
                            <div class="stat-details">
                                <small class="text-muted">Total Columns</small>
                                <div class="h5 mb-0">${summary.columns.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3 col-sm-6">
                        <div class="stat-card">
                            <div class="stat-icon"><i class="bi bi-memory"></i></div>
                            <div class="stat-details">
                                <small class="text-muted">Memory Usage</small>
                                <div class="h5 mb-0">${summary.memory_usage}</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3 col-sm-6">
                        <div class="stat-card">
                            <div class="stat-icon"><i class="bi bi-clock-history"></i></div>
                            <div class="stat-details">
                                <small class="text-muted">Last Updated</small>
                                <div class="h5 mb-0">${new Date().toLocaleTimeString()}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Data Quality Section -->
            ${generateQualitySection(qualityMetrics)}

            <!-- Data Distribution Section -->
            ${generateDistributionSection(distributionMetrics)}

            <!-- Statistical Insights Section -->
            <div class="stats-section">
                <h6 class="stats-header">
                    <i class="bi bi-graph-up me-2"></i>Statistical Insights
                    <div class="stat-controls ms-auto">
                        <button class="btn btn-sm btn-outline-primary" id="expandAllStats">
                            <i class="bi bi-arrows-angle-expand"></i> Expand All
                        </button>
                    </div>
                </h6>
                <div class="row g-3">
                    ${Object.entries(processedStats)
                        .map(([column, stats]) => generateStatisticalCard(column, stats))
                        .join('')}
                </div>
            </div>
        </div>
    `;

    // Initialize interactive features
    initializeStatisticalFeatures();
}

function generateQualitySection(qualityMetrics) {
    return `
        <div class="stats-section mb-4">
            <h6 class="stats-header"><i class="bi bi-shield-check me-2"></i>Data Quality Analysis</h6>
            <div class="row g-3">
                <div class="col-md-3 col-sm-6">
                    <div class="stat-card quality-card">
                        <div class="stat-icon ${qualityMetrics.assessment.completeness.class}">
                            <i class="bi ${qualityMetrics.assessment.completeness.icon}"></i>
                        </div>
                        <div class="stat-details">
                            <small class="text-muted">Completeness</small>
                            <div class="h5 mb-0">${qualityMetrics.completeness}%</div>
                            <div class="progress mt-2" style="height: 4px;">
                                <div class="progress-bar bg-${getProgressBarClass(qualityMetrics.completeness)}" 
                                     style="width: ${qualityMetrics.completeness}%"></div>
                            </div>
                            <small class="quality-label">${qualityMetrics.assessment.completeness.level}</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 col-sm-6">
                    <div class="stat-card quality-card">
                        <div class="stat-icon ${qualityMetrics.assessment.uniqueness.class}">
                            <i class="bi ${qualityMetrics.assessment.uniqueness.icon}"></i>
                        </div>
                        <div class="stat-details">
                            <small class="text-muted">Uniqueness</small>
                            <div class="h5 mb-0">${qualityMetrics.uniqueRate}%</div>
                            <div class="progress mt-2" style="height: 4px;">
                                <div class="progress-bar bg-${getProgressBarClass(qualityMetrics.uniqueRate)}" 
                                     style="width: ${qualityMetrics.uniqueRate}%"></div>
                            </div>
                            <small class="quality-label">${qualityMetrics.assessment.uniqueness.level}</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 col-sm-6">
                    <div class="stat-card quality-card">
                        <div class="stat-icon ${qualityMetrics.assessment.consistency.class}">
                            <i class="bi ${qualityMetrics.assessment.consistency.icon}"></i>
                        </div>
                        <div class="stat-details">
                            <small class="text-muted">Consistency</small>
                            <div class="h5 mb-0">${qualityMetrics.scores.consistencyScore}%</div>
                            <div class="progress mt-2" style="height: 4px;">
                                <div class="progress-bar bg-${getProgressBarClass(qualityMetrics.scores.consistencyScore)}" 
                                     style="width: ${qualityMetrics.scores.consistencyScore}%"></div>
                            </div>
                            <small class="quality-label">${qualityMetrics.assessment.consistency.level}</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 col-sm-6">
                    <div class="stat-card quality-card">
                        <div class="stat-icon ${qualityMetrics.assessment.outliers.class}">
                            <i class="bi ${qualityMetrics.assessment.outliers.icon}"></i>
                        </div>
                        <div class="stat-details">
                            <small class="text-muted">Outlier Score</small>
                            <div class="h5 mb-0">${qualityMetrics.scores.outlierScore}%</div>
                            <div class="progress mt-2" style="height: 4px;">
                                <div class="progress-bar bg-${getProgressBarClass(qualityMetrics.scores.outlierScore)}" 
                                     style="width: ${qualityMetrics.scores.outlierScore}%"></div>
                            </div>
                            <small class="quality-label">${qualityMetrics.assessment.outliers.level}</small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function generateDistributionSection(distributionMetrics) {
    return `
        <div class="stats-section mb-4">
            <h6 class="stats-header"><i class="bi bi-diagram-2 me-2"></i>Data Distribution</h6>
            <div class="row g-3">
                <div class="col-md-3 col-sm-6">
                    <div class="stat-card distribution-card">
                        <div class="stat-icon numeric"><i class="bi bi-123"></i></div>
                        <div class="stat-details">
                            <small class="text-muted">Numeric Columns</small>
                            <div class="h5 mb-0">${distributionMetrics.numericCount}</div>
                            <small class="text-muted">${distributionMetrics.numericPercentage}% of total</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 col-sm-6">
                    <div class="stat-card distribution-card">
                        <div class="stat-icon categorical"><i class="bi bi-list-ul"></i></div>
                        <div class="stat-details">
                            <small class="text-muted">Categorical</small>
                            <div class="h5 mb-0">${distributionMetrics.categoricalCount}</div>
                            <small class="text-muted">${distributionMetrics.categoricalPercentage}% of total</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 col-sm-6">
                    <div class="stat-card distribution-card">
                        <div class="stat-icon datetime"><i class="bi bi-calendar-date"></i></div>
                        <div class="stat-details">
                            <small class="text-muted">DateTime</small>
                            <div class="h5 mb-0">${distributionMetrics.dateCount}</div>
                            <small class="text-muted">${distributionMetrics.datePercentage}% of total</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 col-sm-6">
                    <div class="stat-card distribution-card">
                        <div class="stat-icon text"><i class="bi bi-text-paragraph"></i></div>
                        <div class="stat-details">
                            <small class="text-muted">Text/Other</small>
                            <div class="h5 mb-0">${distributionMetrics.textCount}</div>
                            <small class="text-muted">${distributionMetrics.textPercentage}% of total</small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function initializeStatisticalFeatures() {
    document.querySelectorAll('.expand-stats').forEach(button => {
        button.addEventListener('click', (e) => {
            const card = e.target.closest('.statistical-card');
            const details = card.querySelector('.stat-details');
            const icon = button.querySelector('i');
            const column = card.dataset.column;
            
            details.classList.toggle('show');
            icon.classList.toggle('bi-chevron-down');
            icon.classList.toggle('bi-chevron-up');

            // Initialize charts when expanded
            if (details.classList.contains('show')) {
                const stats = window.appState.currentData.column_stats[column];
                const preview = window.appState.currentData.preview;
                
                // Initialize distribution chart
                const distributionChartId = `dist_${column.replace(/[^a-zA-Z0-9]/g, '_')}`;
                initializeDistributionChart(distributionChartId, preview, column, stats);
                
                // Initialize box plot
                const chartId = `chart_${column.replace(/[^a-zA-Z0-9]/g, '_')}`;
                initializeBoxPlot(chartId, preview, column, stats);
            }
        });
    });

    // Handle expand all button
    document.getElementById('expandAllStats')?.addEventListener('click', () => {
        document.querySelectorAll('.stat-details').forEach(details => {
            const card = details.closest('.statistical-card');
            const column = card.dataset.column;
            details.classList.add('show');
            
            // Initialize all charts
            const stats = window.appState.currentData.column_stats[column];
            const preview = window.appState.currentData.preview;
            
            const distributionChartId = `dist_${column.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const chartId = `chart_${column.replace(/[^a-zA-Z0-9]/g, '_')}`;
            
            initializeDistributionChart(distributionChartId, preview, column, stats);
            initializeBoxPlot(chartId, preview, column, stats);
        });
        
        document.querySelectorAll('.expand-stats i').forEach(icon => {
            icon.classList.remove('bi-chevron-down');
            icon.classList.add('bi-chevron-up');
        });
    });
}

function initializeDistributionChart(chartId, preview, column, stats) {
    const chartDom = document.getElementById(chartId);
    if (!chartDom) return;

    const values = preview.map(row => parseFloat(row[column])).filter(v => !isNaN(v));
    const bins = calculateHistogramBins(values);
    
    const chart = echarts.init(chartDom);
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'shadow'
            }
        },
        grid: {
            left: '10%',
            right: '10%',
            bottom: '15%',
            top: '10%'
        },
        xAxis: {
            type: 'category',
            data: bins.labels,
            axisLabel: {
                color: '#adb5bd',
                rotate: 45
            }
        },
        yAxis: {
            type: 'value',
            axisLabel: {
                color: '#adb5bd'
            }
        },
        series: [{
            name: 'Frequency',
            type: 'bar',
            data: bins.counts,
            itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: '#83bff6' },
                    { offset: 0.5, color: '#188df0' },
                    { offset: 1, color: '#188df0' }
                ])
            }
        }]
    };

    chart.setOption(option);
    window.addEventListener('resize', () => chart.resize());
}

function initializeBoxPlot(chartId, preview, column, stats) {
    const chartDom = document.getElementById(chartId);
    if (!chartDom) return;

    const values = preview.map(row => parseFloat(row[column])).filter(v => !isNaN(v));
    const boxplotData = calculateBoxPlotData(values);
    
    const chart = echarts.init(chartDom);
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'item',
            axisPointer: {
                type: 'shadow'
            }
        },
        grid: {
            left: '10%',
            right: '10%',
            bottom: '15%',
            top: '10%'
        },
        xAxis: {
            type: 'category',
            data: [column],
            axisLabel: {
                color: '#adb5bd'
            }
        },
        yAxis: {
            type: 'value',
            axisLabel: {
                color: '#adb5bd'
            }
        },
        series: [{
            name: 'Box Plot',
            type: 'boxplot',
            data: [boxplotData],
            itemStyle: {
                color: '#188df0',
                borderColor: '#83bff6'
            }
        }]
    };

    chart.setOption(option);
    window.addEventListener('resize', () => chart.resize());
}

function calculateHistogramBins(values) {
    const binCount = Math.min(20, Math.max(5, Math.ceil(1 + 3.322 * Math.log10(values.length))));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / binCount;
    
    const counts = new Array(binCount).fill(0);
    const labels = new Array(binCount).fill(0);
    
    values.forEach(value => {
        const binIndex = Math.min(Math.floor((value - min) / binWidth), binCount - 1);
        counts[binIndex]++;
    });
    
    for (let i = 0; i < binCount; i++) {
        const start = min + i * binWidth;
        const end = min + (i + 1) * binWidth;
        labels[i] = `${start.toFixed(1)}-${end.toFixed(1)}`;
    }
    
    return { counts, labels };
}

function calculateBoxPlotData(values) {
    values.sort((a, b) => a - b);
    const q1 = values[Math.floor(values.length * 0.25)];
    const median = values[Math.floor(values.length * 0.5)];
    const q3 = values[Math.floor(values.length * 0.75)];
    const iqr = q3 - q1;
    const min = Math.max(q1 - 1.5 * iqr, values[0]);
    const max = Math.min(q3 + 1.5 * iqr, values[values.length - 1]);
    
    return [min, q1, median, q3, max];
}

function calculateDataQuality(data) {
    const totalRows = data.metadata.rows || data.data.length;
    const columnNames = data.metadata.column_names || [];
    let completeness = 0;
    let uniqueRate = 0;
    let consistencyScore = 0;
    let outlierScore = 0;

    columnNames.forEach(column => {
        const values = data.data.map(row => row[column]);
        const nonNullValues = values.filter(value => value !== null && value !== undefined);
        const uniqueValues = new Set(values);

        // Calculate completeness
        completeness += (nonNullValues.length / totalRows) * 100;

        // Calculate uniqueness
        uniqueRate += (uniqueValues.size / totalRows) * 100;

        // Calculate consistency
        const isNumeric = values.every(value => !isNaN(value) || value === null || value === undefined);
        if (isNumeric) {
            consistencyScore += 100;
        } else {
            const consistentValues = values.filter(value => typeof value === typeof values[0]);
            consistencyScore += (consistentValues.length / totalRows) * 100;
        }

        // Calculate outliers using IQR
        if (isNumeric) {
            const numericValues = nonNullValues.map(Number).sort((a, b) => a - b);
            const q1 = numericValues[Math.floor((numericValues.length / 4))];
            const q3 = numericValues[Math.floor((numericValues.length * (3 / 4)))];
            const iqr = q3 - q1;
            const lowerBound = q1 - 1.5 * iqr;
            const upperBound = q3 + 1.5 * iqr;
            const outliers = numericValues.filter(value => value < lowerBound || value > upperBound);
            outlierScore += (outliers.length / totalRows) * 100;
        }
    });

    completeness /= columnNames.length;
    uniqueRate /= columnNames.length;
    consistencyScore /= columnNames.length;
    outlierScore /= columnNames.length;

    const qualityMetrics = {
        completeness: completeness.toFixed(2),
        uniqueRate: uniqueRate.toFixed(2),
        scores: {
            consistencyScore: consistencyScore.toFixed(2),
            outlierScore: outlierScore.toFixed(2)
        },
        assessment: {
            completeness: getQualityAssessment(completeness),
            uniqueness: getQualityAssessment(uniqueRate),
            consistency: getQualityAssessment(consistencyScore),
            outliers: getQualityAssessment(100 - outlierScore) // Invert outlier score for assessment
        }
    };

    console.log('Calculated Quality Metrics:', qualityMetrics);
    return qualityMetrics;
}

function getQualityAssessment(score) {
    if (score >= 90) {
        return { class: '', icon: 'bi-check-circle', level: 'High' };
    } else if (score >= 70) {
        return { class: '', icon: 'bi-exclamation-circle', level: 'Medium' };
    } else {
        return { class: '', icon: 'bi-x-circle', level: 'Low' };
    }
}

function getHealthScoreClass(score) {
    if (score >= 90) return 'success';
    if (score >= 70) return 'info';
    if (score >= 50) return 'warning';
    return 'danger';
}

function getProgressBarClass(score) {
    if (score >= 90) return 'success';
    if (score >= 70) return 'info';
    if (score >= 50) return 'warning';
    return 'danger';
}

function calculateDistributionMetrics(data) {
    const metadata = data.metadata || {};
    const totalColumns = metadata.columns || 0;

    // Initialize counts for each type of column
    const counts = {
        numeric: metadata.numeric_columns ? metadata.numeric_columns.length : 0,
        categorical: metadata.categorical_columns ? metadata.categorical_columns.length : 0,
        date: 0, // Implement logic if date columns are identified
        text: 0 // Implement logic if text columns are identified
    };

    // Calculate percentages
    const distributionMetrics = {
        numericCount: counts.numeric,
        categoricalCount: counts.categorical,
        dateCount: counts.date,
        textCount: counts.text,
        numericPercentage: ((counts.numeric / totalColumns) * 100).toFixed(1),
        categoricalPercentage: ((counts.categorical / totalColumns) * 100).toFixed(1),
        datePercentage: ((counts.date / totalColumns) * 100).toFixed(1),
        textPercentage: ((counts.text / totalColumns) * 100).toFixed(1)
    };

    console.log('Calculated Distribution Metrics:', distributionMetrics);
    return distributionMetrics;
}

function calculateColumnStatistics(values) {
    if (!values || values.length === 0) return null;

    const n = values.length;
    const mean = values.reduce((sum, val) => sum + val, 0) / n;
    const sortedValues = [...values].sort((a, b) => a - b);
    const median = sortedValues[Math.floor(n / 2)];
    
    // Calculate variance and standard deviation
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / (n - 1);
    const stdDev = Math.sqrt(variance);

    // Calculate skewness and kurtosis
    const skewness = values.reduce((sum, val) => sum + Math.pow((val - mean) / stdDev, 3), 0) / n;
    const kurtosis = values.reduce((sum, val) => sum + Math.pow((val - mean) / stdDev, 4), 0) / n - 3;

    // Calculate quartiles
    const q1 = sortedValues[Math.floor(n * 0.25)];
    const q3 = sortedValues[Math.floor(n * 0.75)];

    return {
        mean,
        median,
        stdDev,
        skewness,
        kurtosis,
        min: sortedValues[0],
        max: sortedValues[n - 1],
        q1,
        q3
    };
}

function detectPatterns(values, columnName) {
    const stats = calculateColumnStatistics(values);
    const insights = [];
    
    // Distribution Analysis
    if (Math.abs(stats.skewness) < 0.5 && Math.abs(stats.kurtosis) < 0.5) {
        insights.push({
            icon: 'bi-bell',
            type: 'distribution',
            text: `${columnName} follows a normal distribution, suggesting natural, random variation`,
            importance: 'high'
        });
    } else if (Math.abs(stats.skewness) > 1) {
        insights.push({
            icon: 'bi-arrow-right',
            type: 'distribution',
            text: `Strong ${stats.skewness > 0 ? 'right' : 'left'} skew detected, indicating ${stats.skewness > 0 ? 'higher' : 'lower'} values are more common`,
            importance: 'high'
        });
    }

    // Variability Analysis
    const cv = (stats.stdDev / Math.abs(stats.mean)) * 100;
    if (cv > 100) {
        insights.push({
            icon: 'bi-exclamation-triangle',
            type: 'variability',
            text: `High variability detected (CV: ${cv.toFixed(1)}%), suggesting significant spread in the data`,
            importance: 'high'
        });
    } else if (cv < 10) {
        insights.push({
            icon: 'bi-check-circle',
            type: 'variability',
            text: `Low variability (CV: ${cv.toFixed(1)}%), indicating consistent values`,
            importance: 'medium'
        });
    }

    // Outlier Analysis
    const iqr = stats.q3 - stats.q1;
    const lowerBound = stats.q1 - 1.5 * iqr;
    const upperBound = stats.q3 + 1.5 * iqr;
    const outliers = values.filter(v => v < lowerBound || v > upperBound);
    const outlierPercentage = (outliers.length / values.length) * 100;

    if (outliers.length > 0) {
        insights.push({
            icon: 'bi-diamond-exclamation',
            type: 'outliers',
            text: `${outliers.length} outliers detected (${outlierPercentage.toFixed(1)}% of data), potentially affecting analysis`,
            importance: outlierPercentage > 5 ? 'high' : 'medium'
        });
    }

    // Central Tendency
    if (Math.abs(stats.mean - stats.median) > stats.stdDev) {
        insights.push({
            icon: 'bi-arrow-left-right',
            type: 'central_tendency',
            text: `Large difference between mean and median, suggesting presence of extreme values`,
            importance: 'medium'
        });
    }

    // Range Analysis
    const range = stats.max - stats.min;
    const normalizedRange = range / stats.stdDev;
    if (normalizedRange > 6) {
        insights.push({
            icon: 'bi-arrows-expand',
            type: 'range',
            text: `Wide data range (${range.toFixed(2)} units), spanning ${normalizedRange.toFixed(1)} standard deviations`,
            importance: 'medium'
        });
    }

    // Quartile Analysis
    const q2Percentage = ((stats.median - stats.min) / range) * 100;
    if (q2Percentage < 40 || q2Percentage > 60) {
        insights.push({
            icon: 'bi-box',
            type: 'distribution',
            text: `Data concentration ${q2Percentage < 40 ? 'below' : 'above'} the midpoint, suggesting ${q2Percentage < 40 ? 'negative' : 'positive'} bias`,
            importance: 'medium'
        });
    }

    // Zero/Missing Analysis
    const zeroCount = values.filter(v => v === 0).length;
    const zeroPercentage = (zeroCount / values.length) * 100;
    if (zeroPercentage > 10) {
        insights.push({
            icon: 'bi-x-circle',
            type: 'zeros',
            text: `High proportion of zero values (${zeroPercentage.toFixed(1)}%), may need special handling`,
            importance: 'high'
        });
    }

    // Sort insights by importance
    insights.sort((a, b) => {
        const importanceOrder = { high: 0, medium: 1, low: 2 };
        return importanceOrder[a.importance] - importanceOrder[b.importance];
    });

    return {
        distributionType: determineDistributionType(stats.skewness, stats.kurtosis),
        distributionDetails: getDistributionDetails(stats),
        insights: insights,
        stats: stats
    };
}

function findCorrelations(column, data, columnStats) {
    const correlations = [];
    const sourceValues = data.map(row => parseFloat(row[column])).filter(v => !isNaN(v));

    Object.entries(columnStats)
        .filter(([col, stats]) => col !== column && stats.type === 'numeric')
        .forEach(([col, stats]) => {
            const targetValues = data.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
            if (targetValues.length === sourceValues.length) {
                const correlation = calculateCorrelation(sourceValues, targetValues);
                if (Math.abs(correlation) > 0.3) { // Only show meaningful correlations
                    correlations.push({
                        column: col,
                        value: correlation
                    });
                }
            }
        });

    return correlations.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 3);
}

function calculateCorrelation(x, y) {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
}

function determineDistributionType(skewness, kurtosis) {
    if (Math.abs(skewness) < 0.5 && Math.abs(kurtosis) < 0.5) {
        return 'Normal';
    } else if (skewness > 1) {
        return 'Right-Skewed';
    } else if (skewness < -1) {
        return 'Left-Skewed';
    } else if (kurtosis > 1) {
        return 'Heavy-Tailed';
    } else if (kurtosis < -1) {
        return 'Light-Tailed';
    } else {
        return 'Approximately Normal';
    }
}

function getDistributionDetails(stats) {
    const skewness = stats.skewness;
    const kurtosis = stats.kurtosis;
    
    let details = [];
    
    if (Math.abs(skewness) < 0.5) {
        details.push("Approximately symmetric");
    } else if (skewness > 0) {
        details.push("Right-skewed with longer right tail");
    } else {
        details.push("Left-skewed with longer left tail");
    }

    if (Math.abs(kurtosis) < 0.5) {
        details.push("normal peak height");
    } else if (kurtosis > 0) {
        details.push("heavy-tailed");
    } else {
        details.push("light-tailed");
    }

    return details.join(", ");
}

function generateStatisticalCard(column, stats) {
    const actualStats = stats.actualStats;
    const patterns = stats.patterns;
    const correlations = stats.correlations;
    const chartId = `chart_${column.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const distributionChartId = `dist_${column.replace(/[^a-zA-Z0-9]/g, '_')}`;

    return `
        <div class="col-12">
            <div class="stat-card statistical-card" data-column="${column}">
                <div class="stat-header">
                    <div class="stat-icon"><i class="bi bi-calculator"></i></div>
                    <h6 class="mb-0">${column}</h6>
                    <button class="btn btn-sm btn-link expand-stats ms-auto">
                        <i class="bi bi-chevron-down"></i>
                    </button>
                </div>
                
                <div class="stat-content">
                    <!-- Basic Statistics -->
                    <div class="stat-group">
                        <div class="row g-2">
                            ${generateBasicStats(actualStats)}
                        </div>
                    </div>

                    <!-- Expandable Detailed Analysis with Charts -->
                    <div class="stat-details collapse">
                        <div class="row mt-3">
                            <!-- Distribution Chart -->
                            <div class="col-md-6">
                                <div class="chart-wrapper">
                                    <div id="${distributionChartId}" style="height: 200px;"></div>
                                </div>
                            </div>
                            <!-- Box Plot -->
                            <div class="col-md-6">
                                <div class="chart-wrapper">
                                    <div id="${chartId}" style="height: 200px;"></div>
                                </div>
                            </div>
                        </div>
                        ${generateDetailedAnalysis(actualStats, patterns, correlations)}
                    </div>

                    <!-- Key Insights -->
                    <div class="stat-group mt-3">
                        <h6 class="insights-header">
                            <i class="bi bi-lightbulb me-2"></i>Key Insights
                        </h6>
                        <div class="insights-list">
                            ${patterns.insights
                                .map(insight => generateInsightItem(insight))
                                .join('')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function generateBasicStats(stats) {
    return `
        <div class="col-md-3">
            <div class="metric">
                <small>Mean</small>
                <span>${formatNumber(stats.mean)}</span>
            </div>
        </div>
        <div class="col-md-3">
            <div class="metric">
                <small>Median</small>
                <span>${formatNumber(stats.median)}</span>
            </div>
        </div>
        <div class="col-md-3">
            <div class="metric">
                <small>Std Dev</small>
                <span>${formatNumber(stats.stdDev)}</span>
            </div>
        </div>
        <div class="col-md-3">
            <div class="metric">
                <small>CV</small>
                <span>${formatNumber(stats.cv)}%</span>
            </div>
        </div>
    `;
}

function generateDetailedAnalysis(stats, patterns, correlations) {
    return `
        <!-- Distribution Analysis -->
        <div class="stat-group mt-3">
            <h6>Distribution Analysis</h6>
            <div class="distribution-info">
                <div class="row g-2">
                    <div class="col-md-4">
                        <div class="metric">
                            <small>Distribution Type</small>
                            <span>${patterns.distributionType}</span>
                            <div class="small text-muted">${patterns.distributionDetails}</div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="metric">
                            <small>Skewness</small>
                            <span>${formatNumber(stats.skewness)}</span>
                            <div class="small text-muted">${getSkewnessInterpretation(stats.skewness)}</div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="metric">
                            <small>Kurtosis</small>
                            <span>${formatNumber(stats.kurtosis)}</span>
                            <div class="small text-muted">${getKurtosisInterpretation(stats.kurtosis)}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Correlations -->
        ${correlations.length > 0 ? `
            <div class="stat-group mt-3">
                <h6>Key Correlations</h6>
                <div class="correlations-list">
                    ${correlations.map(corr => `
                        <div class="correlation-item">
                            <span class="correlation-value ${getCorrelationClass(corr.value)}">
                                ${formatNumber(corr.value)}
                            </span>
                            <span class="correlation-label">with ${corr.column}</span>
                            <span class="correlation-strength">${getCorrelationStrength(corr.value)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
}

function generateInsightItem(insight) {
    return `
        <div class="insight-item ${insight.importance}">
            <div class="insight-icon">
                <i class="bi ${insight.icon}"></i>
            </div>
            <div class="insight-content">
                <div class="insight-text">${insight.text}</div>
                ${insight.details ? `
                    <div class="insight-details text-muted">
                        ${insight.details}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function formatNumber(value) {
    return (value !== undefined && value !== null) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : 'N/A';
}

function getSkewnessInterpretation(skewness) {
    if (Math.abs(skewness) < 0.5) return 'Approximately symmetric';
    if (skewness > 0) return 'Right-skewed (higher values)';
    return 'Left-skewed (lower values)';
}

function getKurtosisInterpretation(kurtosis) {
    if (Math.abs(kurtosis) < 0.5) return 'Normal tail weight';
    if (kurtosis > 0) return 'Heavy-tailed (more outliers)';
    return 'Light-tailed (fewer outliers)';
}

function getCorrelationClass(value) {
    const abs = Math.abs(value);
    if (abs > 0.7) return 'very-strong';
    if (abs > 0.5) return 'strong';
    if (abs > 0.3) return 'moderate';
    return 'weak';
}

function getCorrelationStrength(value) {
    const abs = Math.abs(value);
    if (abs > 0.7) return 'Very Strong';
    if (abs > 0.5) return 'Strong';
    if (abs > 0.3) return 'Moderate';
    return 'Weak';
}

function updatePreviewTable(preview) {
    const table = document.getElementById('previewTable');
    const prevButton = document.getElementById('prevPage');
    const nextButton = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    const searchInput = document.getElementById('tableSearch');

    if (!preview || !preview.length) {
        table.innerHTML = '<thead><tr><th>No data available</th></tr></thead>';
        return;
    }

    let currentPage = 1;
    const ROWS_PER_PAGE = 10;
    let filteredData = [...preview];

    // Initialize search functionality
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filteredData = preview.filter(row => 
            Object.values(row).some(value => 
                String(value).toLowerCase().includes(searchTerm)
            )
        );
        currentPage = 1;
        renderTable();
    });

    const headers = Object.keys(preview[0]);
    
    function renderTable() {
        const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
        const endIndex = startIndex + ROWS_PER_PAGE;
        const pageData = filteredData.slice(startIndex, endIndex);
        const totalPages = Math.ceil(filteredData.length / ROWS_PER_PAGE);

        // Update pagination buttons
        prevButton.disabled = currentPage === 1;
        nextButton.disabled = currentPage === totalPages;
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

        // Create table header
        const headerRow = headers.map(h => 
            `<th class="position-relative">
                ${h}
                <span class="sort-indicator"></span>
             </th>`
        ).join('');

        // Create table rows with formatted data
        const rows = pageData.map(row => {
            return `<tr>${
                headers.map(h => {
                    const value = row[h];
                    let displayValue = value ?? '';
                    
                    // Format numbers
                    if (typeof value === 'number') {
                        displayValue = isInteger(value) ? 
                            value.toLocaleString() : 
                            value.toLocaleString(undefined, { 
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2 
                            });
                    }
                    
                    // Add title attribute for long content
                    const title = String(displayValue).length > 20 ? 
                        `title="${displayValue}"` : '';
                    
                    return `<td ${title}>${
                        String(displayValue).length > 20 ? 
                        String(displayValue).substring(0, 20) + '...' : 
                        displayValue
                    }</td>`;
                }).join('')
            }</tr>`;
        }).join('');

        table.innerHTML = `
            <thead><tr>${headerRow}</tr></thead>
            <tbody>${rows}</tbody>
        `;

        // Add sorting functionality
        const thElements = table.querySelectorAll('th');
        thElements.forEach((th, index) => {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => sortTable(index, headers[index]));
        });
    }

    // Add event listeners for pagination
    prevButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });

    nextButton.addEventListener('click', () => {
        if (currentPage < Math.ceil(filteredData.length / ROWS_PER_PAGE)) {
            currentPage++;
            renderTable();
        }
    });

    // Initial render
    renderTable();
}

// Helper functions
function isInteger(value) {
    return typeof value === 'number' && Math.floor(value) === value;
}

function sortTable(columnIndex, columnName) {
    const sortIndicators = document.querySelectorAll('.sort-indicator');
    const currentIndicator = sortIndicators[columnIndex];
    const isAscending = currentIndicator.classList.contains('asc');

    // Reset all indicators
    sortIndicators.forEach(indicator => {
        indicator.classList.remove('asc', 'desc');
        indicator.textContent = '';
    });

    // Sort the data
    filteredData.sort((a, b) => {
        const aVal = a[columnName];
        const bVal = b[columnName];

        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return isAscending ? bVal - aVal : aVal - bVal;
        } else {
            const aStr = String(aVal ?? '').toLowerCase();
            const bStr = String(bVal ?? '').toLowerCase();
            return isAscending ? 
                bStr.localeCompare(aStr) : 
                aStr.localeCompare(bStr);
        }
    });

    // Update sort indicator
    currentIndicator.classList.add(isAscending ? 'desc' : 'asc');
    currentIndicator.textContent = isAscending ? ' ▼' : ' ▲';

    // Re-render table
    renderTable();
}

function initializeDocumentViewer() {
    const rawViewBtn = document.getElementById('rawViewBtn');
    const tableViewBtn = document.getElementById('tableViewBtn');
    const rawContent = document.getElementById('rawContent');
    const tableContent = document.getElementById('tableContent');
    const noDocumentMsg = document.getElementById('noDocumentMsg');
    const documentContent = document.getElementById('documentContent');

    rawViewBtn.addEventListener('click', () => {
        rawViewBtn.classList.add('active');
        tableViewBtn.classList.remove('active');
        rawContent.classList.remove('d-none');
        tableContent.classList.add('d-none');
    });

    tableViewBtn.addEventListener('click', () => {
        tableViewBtn.classList.add('active');
        rawViewBtn.classList.remove('active');
        tableContent.classList.remove('d-none');
        rawContent.classList.add('d-none');
    });

    // Set default view
    tableViewBtn.click();
}

async function displayFileContent(file) {
    const rawContent = document.getElementById('rawContent');
    const tableContent = document.getElementById('tableContent');
    const noDocumentMsg = document.getElementById('noDocumentMsg');
    const documentContent = document.getElementById('documentContent');

    try {
        const content = await readFileContent(file);
        
        // Show document content and hide no document message
        noDocumentMsg.classList.add('d-none');
        documentContent.classList.remove('d-none');

        // Display raw content
        rawContent.textContent = content;

        // Display table content
        const tableHtml = await generateTableView(file, content);
        tableContent.innerHTML = tableHtml;

    } catch (error) {
        console.error('Error displaying file content:', error);
        showError('Error displaying file content: ' + error.message);
    }
}

async function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            resolve(event.target.result);
        };
        
        reader.onerror = (error) => {
            reject(error);
        };

        if (file.type.includes('text') || file.name.endsWith('.csv') || file.name.endsWith('.json')) {
            reader.readAsText(file);
        } else {
            reader.readAsBinaryString(file);
        }
    });
}

async function generateTableView(file, content) {
    const extension = file.name.split('.').pop().toLowerCase();
    let data = [];
    let headers = [];

    try {
        switch (extension) {
            case 'csv':
                const parsedCsv = Papa.parse(content, { header: true });
                data = parsedCsv.data;
                headers = parsedCsv.meta.fields;
                break;

            case 'json':
                data = JSON.parse(content);
                if (Array.isArray(data)) {
                    headers = Object.keys(data[0] || {});
                } else {
                    data = [data];
                    headers = Object.keys(data[0] || {});
                }
                break;

            case 'xlsx':
            case 'xls':
                const workbook = XLSX.read(content, { type: 'binary' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const excelData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                headers = excelData[0];
                data = excelData.slice(1).map(row => {
                    const obj = {};
                    headers.forEach((header, i) => {
                        obj[header] = row[i];
                    });
                    return obj;
                });
                break;

            default:
                return `<div class="alert alert-info">Table view not available for this file type</div>`;
        }

        // Generate table HTML
        return `
            <table class="table table-hover">
                <thead>
                    <tr>
                        ${headers.map(header => `<th>${header}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${data.slice(0, 100).map(row => `
                        <tr>
                            ${headers.map(header => `<td>${row[header] || ''}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${data.length > 100 ? '<div class="text-muted text-center mt-2">Showing first 100 rows</div>' : ''}
        `;

    } catch (error) {
        console.error('Error generating table view:', error);
        return `<div class="alert alert-danger">Error generating table view: ${error.message}</div>`;
    }
}
