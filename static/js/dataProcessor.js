function safelySerializeNumber(value) {
    if (value === Infinity) return "Infinity";
    if (value === -Infinity) return "-Infinity";
    if (typeof value === 'number' && isNaN(value)) return null;
    return value;
}

function processData(data) {
    if (!data || typeof data !== 'object') {
        console.error('Invalid data format received:', data);
        return null;
    }

    try {
        // Validate data structure
        if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
            console.error('Invalid or empty data');
            return null;
        }

        console.log('Data received:', data.data);

        // Store the raw data first
        window.appState = {
            ...window.appState,
            data: data.data,
            fullData: data.data,
            columns: Object.keys(data.data[0] || {}),
            dataLoaded: true
        };

        // Safely extract column stats with validation
        const columnStats = data.column_stats || {};
        if (Object.keys(columnStats).length === 0) {
            console.warn('No column statistics available');
        }
        
        // Get numeric columns with additional validation
        const numericColumns = Object.entries(columnStats)
            .filter(([col, stats]) => {
                return stats && 
                       stats.type === 'numeric' && 
                       !isColumnEmpty(data.data || [], col);
            })
            .map(([col]) => col);

        console.log('Found numeric columns:', numericColumns);

        // Update state with column stats and numeric columns
        window.appState = {
            ...window.appState,
            column_stats: columnStats,
            numeric_columns: numericColumns
        };

        // Process data with safe serialization
        const processedData = {
            histogram: numericColumns.length > 0 ? safelyPrepareHistogramData(data, numericColumns[0]) : null,
            scatter: numericColumns.length > 1 ? safelyPrepareScatterData(data, numericColumns[0], numericColumns[1]) : null,
            boxplot: safelyPrepareBoxplotData(data, numericColumns),
            heatmap: numericColumns.length > 1 ? safelyPrepareHeatmapData(data, numericColumns) : null
        };

        // Filter out null visualizations
        const validVisualizations = Object.fromEntries(
            Object.entries(processedData).filter(([_, value]) => value !== null)
        );

        // Generate visualization configurations
        const visualizationConfigs = generateVisualizationConfigs(validVisualizations);

        // Update visualizations if available
        if (window.visualizationTools && visualizationConfigs.length > 0) {
            window.visualizationTools.updateVisualizations(visualizationConfigs);
        }

        return {
            processedData: validVisualizations,
            visualizationConfigs
        };
    } catch (error) {
        console.error('Error processing data:', error);
        // Ensure state is cleared on error
        window.appState = {
            ...window.appState,
            dataLoaded: false,
            error: error.message
        };
        return null;
    }
}

function generateVisualizationConfigs(processedData) {
    const configs = [];

    if (processedData.histogram) {
        configs.push({
            title: {
                text: `Distribution of ${processedData.histogram.column}`
            },
            tooltip: {
                trigger: 'axis'
            },
            xAxis: {
                type: 'category',
                data: processedData.histogram.bins
            },
            yAxis: {
                type: 'value'
            },
            series: [{
                type: 'bar',
                data: processedData.histogram.values,
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: '#3498db' },
                        { offset: 1, color: '#2980b9' }
                    ])
                }
            }]
        });
    }

    if (processedData.scatter) {
        configs.push({
            title: {
                text: `${processedData.scatter.xLabel} vs ${processedData.scatter.yLabel}`
            },
            tooltip: {
                trigger: 'item'
            },
            xAxis: {
                type: 'value',
                name: processedData.scatter.xLabel
            },
            yAxis: {
                type: 'value',
                name: processedData.scatter.yLabel
            },
            series: [{
                type: 'scatter',
                data: processedData.scatter.x.map((x, i) => [x, processedData.scatter.y[i]]),
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: '#2ecc71' },
                        { offset: 1, color: '#27ae60' }
                    ])
                }
            }]
        });
    }

    if (processedData.boxplot) {
        configs.push({
            title: {
                text: 'Data Distribution Overview'
            },
            tooltip: {
                trigger: 'item',
                formatter: function(params) {
                    return `${params.name}<br/>
                            Max: ${params.data.stats.max}<br/>
                            Q3: ${params.data.stats.q3}<br/>
                            Median: ${params.data.stats.median}<br/>
                            Q1: ${params.data.stats.q1}<br/>
                            Min: ${params.data.stats.min}`;
                }
            },
            xAxis: {
                type: 'category',
                data: processedData.boxplot.map(item => item.name)
            },
            yAxis: {
                type: 'value'
            },
            series: [{
                type: 'boxplot',
                data: processedData.boxplot.map(item => [
                    item.stats.min,
                    item.stats.q1,
                    item.stats.median,
                    item.stats.q3,
                    item.stats.max
                ])
            }]
        });
    }

    if (processedData.heatmap) {
        configs.push({
            title: {
                text: 'Correlation Heatmap'
            },
            tooltip: {
                position: 'top'
            },
            grid: {
                height: '50%',
                top: '10%'
            },
            xAxis: {
                type: 'category',
                data: processedData.heatmap.columns,
                splitArea: {
                    show: true
                }
            },
            yAxis: {
                type: 'category',
                data: processedData.heatmap.columns,
                splitArea: {
                    show: true
                }
            },
            visualMap: {
                min: -1,
                max: 1,
                calculable: true,
                orient: 'horizontal',
                left: 'center',
                bottom: '15%'
            },
            series: [{
                type: 'heatmap',
                data: processedData.heatmap.values,
                label: {
                    show: true
                },
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                }
            }]
        });
    }

    return configs;
}

function isColumnEmpty(preview, column) {
    if (!Array.isArray(preview) || preview.length === 0) return true;
    
    const validValues = preview
        .map(row => row[column])
        .filter(value => value !== null && value !== undefined && value !== '');
    
    return validValues.length === 0;
}

function validateNumericValues(values) {
    if (!Array.isArray(values)) return [];
    
    return values
        .map(v => {
            // Handle various numeric formats
            if (typeof v === 'number' && isFinite(v)) return v;
            if (typeof v === 'string') {
                // Remove currency symbols, commas, and other non-numeric characters
                const cleaned = v.replace(/[^-0-9.]/g, '');
                const parsed = parseFloat(cleaned);
                return isFinite(parsed) ? parsed : null;
            }
            return null;
        })
        .filter(v => v !== null && isFinite(v));
}

function safelyPrepareHistogramData(data, column) {
    if (!column || !data.data || !Array.isArray(data.data)) {
        return null;
    }

    try {
        const values = validateNumericValues(data.data.map(row => row[column]));
        if (values.length < 2) return null;

        // Use Sturges' formula for bin count
        const binCount = Math.max(5, Math.min(20, Math.ceil(1 + 3.322 * Math.log10(values.length))));
        const min = Math.min(...values);
        const max = Math.max(...values);
        
        // Prevent division by zero
        if (min === max) {
            return {
                column,
                values: [values.length],
                bins: [`${min}`]
            };
        }

        const binWidth = (max - min) / binCount;
        const bins = Array(binCount).fill(0);

        values.forEach(value => {
            const binIndex = Math.min(
                Math.floor((value - min) / binWidth),
                binCount - 1
            );
            bins[binIndex]++;
        });

        return {
            column,
            values: bins,
            bins: Array(binCount).fill(0).map((_, i) => {
                const start = min + i * binWidth;
                const end = min + (i + 1) * binWidth;
                return `${start.toFixed(2)} - ${end.toFixed(2)}`;
            })
        };
    } catch (error) {
        console.error('Error preparing histogram data:', error);
        return null;
    }
}

function safelyPrepareScatterData(data, columnX, columnY) {
    if (!columnX || !columnY || !data.data || !Array.isArray(data.data)) {
        return null;
    }

    try {
        const pairedData = data.data
            .map(row => {
                const x = validateNumericValues([row[columnX]])[0];
                const y = validateNumericValues([row[columnY]])[0];
                return [x, y];
            })
            .filter(([x, y]) => x !== undefined && y !== undefined);

        if (pairedData.length < 2) return null;

        return {
            x: pairedData.map(d => d[0]),
            y: pairedData.map(d => d[1]),
            xLabel: columnX,
            yLabel: columnY
        };
    } catch (error) {
        console.error('Error preparing scatter data:', error);
        return null;
    }
}

function safelyPrepareBoxplotData(data, columns) {
    if (!columns || !Array.isArray(columns) || columns.length === 0) {
        return null;
    }

    try {
        const validBoxplots = columns
            .map(col => {
                const values = validateNumericValues(data.data.map(row => row[col]));
                if (values.length < 5) return null;

                values.sort((a, b) => a - b);
                const q1 = values[Math.floor(values.length * 0.25)];
                const median = values[Math.floor(values.length * 0.5)];
                const q3 = values[Math.floor(values.length * 0.75)];
                const iqr = q3 - q1;
                const min = Math.max(q1 - 1.5 * iqr, values[0]);
                const max = Math.min(q3 + 1.5 * iqr, values[values.length - 1]);

                return {
                    name: col,
                    stats: { min, q1, median, q3, max }
                };
            })
            .filter(boxplot => boxplot !== null);

        return validBoxplots.length > 0 ? validBoxplots : null;
    } catch (error) {
        console.error('Error preparing boxplot data:', error);
        return null;
    }
}

function safelyPrepareHeatmapData(data, columns) {
    if (!columns || columns.length < 2) {
        return null;
    }

    try {
        const correlationMatrix = {
            columns: columns,
            values: []
        };

        for (let i = 0; i < columns.length; i++) {
            for (let j = 0; j < columns.length; j++) {
                const correlation = i === j ? 1 : calculateCorrelation(
                    validateNumericValues(data.data.map(row => row[columns[i]])),
                    validateNumericValues(data.data.map(row => row[columns[j]]))
                );
                correlationMatrix.values.push([i, j, correlation || 0]);
            }
        }

        return correlationMatrix;
    } catch (error) {
        console.error('Error preparing heatmap data:', error);
        return null;
    }
}

function calculateCorrelation(x, y) {
    try {
        if (!Array.isArray(x) || !Array.isArray(y) || x.length < 2 || y.length < 2) {
            return null;
        }

        const n = Math.min(x.length, y.length);
        const pairs = Array(n).fill(0)
            .map((_, i) => [x[i], y[i]])
            .filter(([a, b]) => isFinite(a) && isFinite(b));

        if (pairs.length < 2) return null;

        const sumX = pairs.reduce((acc, [a]) => acc + a, 0);
        const sumY = pairs.reduce((acc, [_, b]) => acc + b, 0);
        const sumXY = pairs.reduce((acc, [a, b]) => acc + a * b, 0);
        const sumX2 = pairs.reduce((acc, [a]) => acc + a * a, 0);
        const sumY2 = pairs.reduce((acc, [_, b]) => acc + b * b, 0);

        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt(
            (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
        );

        const correlation = denominator === 0 ? 0 : numerator / denominator;
        return isFinite(correlation) ? correlation : 0;
    } catch (error) {
        console.error('Error calculating correlation:', error);
        return null;
    }
}
