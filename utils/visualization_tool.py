from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

class VisualizationError(Exception):
    pass

def create_visualization_code(context: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    """Create visualization code only when appropriate."""
    try:
        # First check if visualization is explicitly requested
        if not params.get('should_visualize', False):
            return {
                "success": False,
                "error": "Visualization not required for this response",
                "visualization": None
            }

        # Check if we have valid data
        if not context.get('data'):
            return {
                "success": False,
                "error": "No data available for visualization",
                "visualization": None
            }

        # If custom HTML visualization is provided
        if params.get('html_content'):
            return {
                "success": True,
                "visualization": params['html_content'],
                "type": "html"
            }
            
        # Get visualization configuration
        config = params.get('visualization', {})
        
        # Ensure basic configuration requirements
        if not isinstance(config, dict):
            raise VisualizationError("Invalid visualization configuration format")
            
        # Add default styling if not present
        if 'backgroundColor' not in config:
            config['backgroundColor'] = 'transparent'
        if 'textStyle' not in config:
            config['textStyle'] = {'color': '#e9ecef'}
            
        return {
            "success": True,
            "visualization": config,
            "type": "echarts"
        }

    except Exception as e:
        logger.error(f"Visualization error: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "visualization": None
        }

def create_fallback_visualization():
    """Create a simple fallback visualization for error cases."""
    return {
        "title": {"text": "Visualization Error", "textStyle": {"color": "#fff"}},
        "series": [{"type": "bar", "data": []}]
    }
