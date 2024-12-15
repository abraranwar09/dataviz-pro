import pandas as pd
import numpy as np
from typing import Dict, Any, List, Tuple
import io
import logging
import re
import json
from openai import OpenAI
from concurrent.futures import ThreadPoolExecutor
import os

logger = logging.getLogger(__name__)

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

def analyze_column_with_ai(column_name: str, sample_values: List[Any]) -> Dict[str, Any]:
    """Use AI to analyze column type and format."""
    try:
        # Prepare sample data for AI analysis
        samples = str(sample_values[:10])  # Convert first 10 values to string
        
        prompt = f"""Analyze column '{column_name}' with samples: {samples}
Provide comprehensive analysis including:
1. Data Type: Precise classification (numeric-continuous, numeric-discrete, categorical-nominal, categorical-ordinal, datetime, text-structured, text-unstructured)
2. Statistical Properties: Distribution type, range, central tendency
3. Quality Metrics: Missing values, outliers, inconsistencies
4. Format Patterns: Regular expressions, standardization rules
5. Semantic Context: Business meaning, typical usage, common patterns
6. Cleaning Recommendations: Specific steps for data normalization
7. Relationship Potential: Suggested correlations with other columns

Return structured JSON with detailed analysis metrics."""

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a data analysis expert. Respond in JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0,
            response_format={ "type": "json_object" }
        )

        analysis = json.loads(response.choices[0].message.content)
        return {
            'type': analysis.get('data_type', 'unknown'),
            'format': analysis.get('format_pattern', None),
            'cleaning_strategy': analysis.get('cleaning_strategy', None)
        }
    except Exception as e:
        logger.error(f"AI analysis failed for column {column_name}: {str(e)}")
        return {'type': 'unknown', 'format': None, 'cleaning_strategy': None}

def clean_value_based_on_strategy(value: Any, strategy: Dict[str, Any]) -> Any:
    """Clean a value based on the AI-determined strategy."""
    if pd.isna(value):
        return np.nan
        
    try:
        value_type = strategy.get('type', 'unknown')
        cleaning_strategy = strategy.get('cleaning_strategy', {})
        
        if value_type == 'numeric':
            if isinstance(value, str):
                # Remove any non-numeric characters except decimal and negative
                cleaned = re.sub(r'[^0-9.-]', '', value)
                return float(cleaned) if cleaned else np.nan
            return float(value) if pd.notnull(value) else np.nan
            
        elif value_type == 'date':
            if pd.notnull(value):
                return pd.to_datetime(value, errors='coerce')
            return np.nan
            
        elif value_type == 'categorical':
            if pd.notnull(value):
                return str(value).strip().lower()
            return None
            
        elif value_type == 'text':
            if pd.notnull(value):
                return str(value).strip()
            return None
            
        return value
    except Exception as e:
        logger.warning(f"Error cleaning value {value}: {str(e)}")
        return np.nan

def calculate_statistics(values: np.ndarray) -> Dict[str, float]:
    """Calculate statistics with proper handling of NaN and invalid values."""
    try:
        # Remove any NaN or infinite values
        clean_values = values[np.isfinite(values)]
        
        if len(clean_values) == 0:
            return {
                'mean': 0.0,
                'median': 0.0,
                'std': 0.0,
                'min': 0.0,
                'max': 0.0,
                'valid_count': 0,
                'null_count': len(values)
            }
            
        # Calculate statistics using numpy's nan-safe functions
        stats = {
            'mean': float(np.nanmean(clean_values)),
            'median': float(np.nanmedian(clean_values)),
            'min': float(np.nanmin(clean_values)),
            'max': float(np.nanmax(clean_values)),
            'valid_count': int(len(clean_values)),
            'null_count': int(len(values) - len(clean_values))
        }
        
        # Calculate standard deviation carefully
        if len(clean_values) > 1:
            # Use ddof=1 for sample standard deviation
            stats['std'] = float(np.nanstd(clean_values, ddof=1))
        else:
            stats['std'] = 0.0
            
        return stats
        
    except Exception as e:
        logger.error(f"Error calculating statistics: {str(e)}")
        return {
            'mean': 0.0,
            'median': 0.0,
            'std': 0.0,
            'min': 0.0,
            'max': 0.0,
            'valid_count': 0,
            'null_count': len(values)
        }

def process_data(df: pd.DataFrame) -> Dict[str, Any]:
    """Process data with improved numeric handling."""
    
    try:
        # Clean column names
        df.columns = df.columns.str.strip()
        
        # Initialize stats dictionary
        stats = {
            'summary': {
                'rows': int(len(df)),
                'columns': int(len(df.columns)),
                'numeric_columns': 0,
                'categorical_columns': 0,
                'memory_usage': f"{float(df.memory_usage(deep=True).sum()) / 1024 / 1024:.2f} MB"
            },
            'column_stats': {},
            'columns': list(df.columns)
        }
        
        # Process each column
        processed_df = df.copy()
        for column in df.columns:
            try:
                # Convert to numeric, handling errors
                numeric_values = pd.to_numeric(df[column], errors='coerce')
                non_null_ratio = numeric_values.notna().sum() / len(df)
                
                if non_null_ratio > 0.5:  # More than 50% numeric values
                    # Convert to numpy array for calculations
                    values = numeric_values.to_numpy()
                    column_stats = calculate_statistics(values)
                    
                    stats['column_stats'][column] = {
                        'type': 'numeric',
                        **column_stats
                    }
                    stats['summary']['numeric_columns'] += 1
                    # Update the processed dataframe with cleaned numeric values
                    processed_df[column] = numeric_values
                    
                else:
                    # Handle as categorical
                    value_counts = df[column].value_counts(dropna=False)
                    stats['column_stats'][column] = {
                        'type': 'categorical',
                        'unique_values': int(len(value_counts)),
                        'top_values': convert_to_native_types(value_counts.head(10).to_dict()),
                        'null_count': int(df[column].isna().sum())
                    }
                    stats['summary']['categorical_columns'] += 1
                    # Clean categorical values
                    processed_df[column] = df[column].astype(str).str.strip()
                    
            except Exception as e:
                logger.warning(f"Error processing column {column}: {str(e)}")
                stats['column_stats'][column] = {
                    'type': 'error',
                    'error': str(e)
                }

        # Add preview data (first 5 rows)
        preview_df = processed_df.head(5).copy()
        stats['preview'] = convert_to_native_types(preview_df.to_dict('records'))
        
        # Add full processed dataset
        stats['data'] = convert_to_native_types(processed_df.to_dict('records'))
        
        return convert_to_native_types(stats)
        
    except Exception as e:
        logger.exception("Error processing data")
        raise ValueError(f"Error processing data: {str(e)}")

def convert_to_native_types(obj: Any) -> Any:
    """Convert numpy/pandas types to Python native types."""
    if isinstance(obj, dict):
        return {key: convert_to_native_types(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_to_native_types(item) for item in obj]
    elif isinstance(obj, (np.int64, np.int32, np.int16, np.int8)):
        return int(obj)
    elif isinstance(obj, (np.float64, np.float32, np.float16)):
        return float(obj)
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, pd.Series):
        return convert_to_native_types(obj.to_list())
    elif isinstance(obj, np.ndarray):
        return convert_to_native_types(obj.tolist())
    elif pd.isna(obj):
        return None
    return obj

def chunk_process_data(df: pd.DataFrame, chunk_size: int = 10000) -> Dict[str, Any]:
    """Process large datasets in chunks with robust error handling."""
    
    try:
        total_rows = len(df)
        chunks = []
        chunk_stats = []
        processed_chunks = []
        
        # Process data in chunks
        for i in range(0, total_rows, chunk_size):
            chunk = df.iloc[i:i + chunk_size].copy()
            chunk_result = process_data(chunk)
            chunk_stats.append(chunk_result)
            # Store the processed data from each chunk
            processed_chunks.extend(chunk_result['data'])
        
        # Combine chunk statistics
        combined_stats = {
            'summary': {
                'rows': int(total_rows),
                'columns': int(len(df.columns)),
                'numeric_columns': 0,
                'categorical_columns': 0,
                'memory_usage': f"{float(df.memory_usage(deep=True).sum()) / 1024 / 1024:.2f} MB",
                'chunks_processed': len(chunk_stats)
            },
            'column_stats': {},
            'preview': convert_to_native_types(df.head(5).to_dict('records')),
            'columns': list(df.columns),
            # Add the full processed dataset
            'data': processed_chunks
        }
        
        # Merge column statistics
        for col in df.columns:
            try:
                numeric_chunks = [
                    chunk['column_stats'][col]
                    for chunk in chunk_stats
                    if chunk['column_stats'].get(col, {}).get('type') == 'numeric'
                ]
                
                if numeric_chunks:
                    # Combine numeric statistics
                    combined_stats['column_stats'][col] = {
                        'type': 'numeric',
                        'mean': float(np.nanmean([chunk['mean'] for chunk in numeric_chunks])),
                        'median': float(np.nanmedian([chunk['median'] for chunk in numeric_chunks])),
                        'std': float(np.nanstd([chunk['std'] for chunk in numeric_chunks])),
                        'min': float(np.nanmin([chunk['min'] for chunk in numeric_chunks])),
                        'max': float(np.nanmax([chunk['max'] for chunk in numeric_chunks]))
                    }
                    combined_stats['summary']['numeric_columns'] += 1
                else:
                    # Use categorical statistics from first chunk
                    combined_stats['column_stats'][col] = convert_to_native_types(
                        chunk_stats[0]['column_stats'][col]
                    )
                    if chunk_stats[0]['column_stats'][col]['type'] == 'categorical':
                        combined_stats['summary']['categorical_columns'] += 1
                        
            except Exception as e:
                logger.warning(f"Error combining statistics for column {col}: {str(e)}")
                combined_stats['column_stats'][col] = {
                    'type': 'error',
                    'error': str(e)
                }
        
        return convert_to_native_types(combined_stats)
        
    except Exception as e:
        logger.exception("Error in chunk processing")
        raise ValueError(f"Error processing data chunks: {str(e)}")
