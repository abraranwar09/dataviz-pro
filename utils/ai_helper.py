import os
import json
from openai import OpenAI
import pandas as pd
import numpy as np
from .cache_manager import OpenAICache, cache_openai_request
import asyncio
from typing import Dict, Any, List, Optional
from concurrent.futures import ThreadPoolExecutor
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Initialize OpenAI client and cache
openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
openai_cache = OpenAICache()
thread_pool = ThreadPoolExecutor()

# Use the correct model name
DEFAULT_MODEL = "gpt-4o"  # Latest GPT-4 Turbo model


async def run_in_thread(func, *args, **kwargs):
    """Run a synchronous function in a thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(thread_pool,
                                      lambda: func(*args, **kwargs))


async def create_visualization(config: Dict[str, Any],
                               data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Create a visualization configuration with actual data."""
    try:
        chart_type = config.get("chart_type", "line")  # Default to line chart if not specified
        title = config.get("title", "Data Visualization")

        # Convert data to DataFrame for easier processing
        df = pd.DataFrame(data)

        # Create a basic visualization based on chart type
        viz_config = {
            "type": "echarts",  # Specify the visualization type
            "config": {  # Wrap the actual config in a config field
                "title": {
                    "text": title,
                    "textStyle": {
                        "color": "#fff"
                    }
                },
                "tooltip": {
                    "trigger": "axis",
                    "backgroundColor": "rgba(30, 32, 35, 0.9)",
                    "borderColor": "#555",
                    "textStyle": {
                        "color": "#fff"
                    }
                },
                "legend": {
                    "textStyle": {
                        "color": "#fff"
                    },
                    "data": []  # Will be filled based on the chart type
                },
                "grid": {
                    "left": "3%",
                    "right": "4%",
                    "bottom": "3%",
                    "containLabel": True
                },
                "backgroundColor": "transparent",
                "textStyle": {
                    "color": "#e9ecef"
                }
            }
        }

        # Get numeric columns
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        if len(numeric_cols) == 0:
            raise ValueError("No numeric columns available for visualization")

        # Get categorical columns
        cat_cols = df.select_dtypes(exclude=[np.number]).columns

        # Configure axes based on chart type
        if chart_type in ["bar", "line"]:
            # For the specific request of balance vs age
            if "age" in df.columns and "balance" in df.columns:
                # Sort by age for better visualization
                df = df.sort_values("age")
                x_data = df["age"].tolist()
                y_data = df["balance"].tolist()
                
                viz_config["config"].update({
                    "xAxis": {
                        "type": "category",
                        "data": x_data,
                        "name": "Age",
                        "axisLabel": {
                            "color": "#fff"
                        }
                    },
                    "yAxis": {
                        "type": "value",
                        "name": "Balance",
                        "axisLabel": {
                            "color": "#fff"
                        }
                    },
                    "series": [{
                        "name": "Balance",
                        "type": chart_type,
                        "data": y_data,
                        "smooth": True if chart_type == "line" else False
                    }]
                })
                viz_config["config"]["legend"]["data"].append("Balance")
            else:
                # Default handling for other cases
                x_col = cat_cols[0] if len(cat_cols) > 0 else df.index.name or 'index'
                x_data = df[x_col].tolist() if len(cat_cols) > 0 else df.index.tolist()

                viz_config["config"].update({
                    "xAxis": {
                        "type": "category",
                        "data": x_data,
                        "axisLabel": {
                            "color": "#fff",
                            "rotate": 45 if len(x_data) > 10 else 0
                        }
                    },
                    "yAxis": {
                        "type": "value",
                        "axisLabel": {
                            "color": "#fff"
                        }
                    },
                    "series": []
                })

                for col in numeric_cols[:3]:
                    series = {
                        "name": col,
                        "type": chart_type,
                        "data": df[col].tolist(),
                        "smooth": True if chart_type == "line" else False
                    }
                    viz_config["config"]["series"].append(series)
                    viz_config["config"]["legend"]["data"].append(col)

        elif chart_type == "scatter":
            if len(numeric_cols) < 2:
                raise ValueError("Need at least 2 numeric columns for scatter plot")

            viz_config["config"].update({
                "xAxis": {
                    "type": "value",
                    "name": numeric_cols[0],
                    "axisLabel": {
                        "color": "#fff"
                    }
                },
                "yAxis": {
                    "type": "value",
                    "name": numeric_cols[1],
                    "axisLabel": {
                        "color": "#fff"
                    }
                },
                "series": [{
                    "type": "scatter",
                    "name": f"{numeric_cols[0]} vs {numeric_cols[1]}",
                    "data": df[[numeric_cols[0], numeric_cols[1]]].values.tolist(),
                    "symbolSize": 10,
                    "itemStyle": {
                        "opacity": 0.8
                    }
                }]
            })
            viz_config["config"]["legend"]["data"].append(f"{numeric_cols[0]} vs {numeric_cols[1]}")

        elif chart_type == "pie":
            value_col = numeric_cols[0]
            label_col = cat_cols[0] if len(cat_cols) > 0 else df.index.name or 'index'
            
            if len(cat_cols) > 0:
                pie_data = df.groupby(label_col)[value_col].sum()
            else:
                pie_data = df[value_col]

            viz_config["config"].update({
                "series": [{
                    "type": "pie",
                    "radius": "60%",
                    "data": [
                        {"value": float(v), "name": str(k)}
                        for k, v in pie_data.items()
                    ],
                    "label": {
                        "color": "#fff"
                    },
                    "emphasis": {
                        "itemStyle": {
                            "shadowBlur": 10,
                            "shadowOffsetX": 0,
                            "shadowColor": "rgba(0, 0, 0, 0.5)"
                        }
                    }
                }]
            })

        return viz_config
    except Exception as e:
        logger.error(f"Error creating visualization: {str(e)}")
        return None


@cache_openai_request(openai_cache)
async def send_openai_request(prompt: str, **kwargs) -> Dict[str, Any]:
    """Send a request to OpenAI with proper error handling."""
    try:
        # Verify API key
        if not os.getenv('OPENAI_API_KEY'):
            raise ValueError("OpenAI API key is not set")

        # Prepare the messages
        messages = [{
            "role":
            "system",
            "content":
            kwargs.get(
                "system_prompt",
                "You are a helpful data analysis assistant. Analyze the data and provide clear insights."
            )
        }, {
            "role": "user",
            "content": prompt
        }]

        # Add context messages if available
        if kwargs.get("previous_messages"):
            messages[1:1] = kwargs["previous_messages"]

        logger.info(
            f"Sending request to OpenAI with model {kwargs.get('model', DEFAULT_MODEL)}"
        )

        # Prepare API call parameters
        api_params = {
            "model": kwargs.get("model", DEFAULT_MODEL),
            "messages": messages
        }

        if kwargs.get("functions"):
            api_params["functions"] = kwargs["functions"]
            api_params["function_call"] = kwargs.get("function_call", "auto")

        # Make the API call
        response = await run_in_thread(openai_client.chat.completions.create,
                                       **api_params)

        message = response.choices[0].message

        # Handle function calls
        if message.function_call:
            function_calls = []

            # Support multiple function calls
            if isinstance(message.function_call, list):
                function_calls = message.function_call
            else:
                function_calls = [message.function_call]

            # Process all function calls in parallel
            async def process_function_call(func_call):
                try:
                    function_name = func_call.name
                    function_args = json.loads(func_call.arguments)

                    if function_name == "create_visualization":
                        viz_config = await create_visualization(
                            function_args,
                            kwargs.get("context", {}).get("data", []))
                        return {"name": function_name, "results": viz_config}
                    return None
                except Exception as e:
                    logger.error(
                        f"Error in function call {function_name}: {str(e)}")
                    return None

            # Execute all function calls in parallel
            function_results = await asyncio.gather(
                *[process_function_call(call) for call in function_calls],
                return_exceptions=True)

            # Filter out errors and None results
            valid_results = [
                r for r in function_results
                if r is not None and not isinstance(r, Exception)
            ]

            # Add function results to messages
            for result in valid_results:
                messages.append(message)
                messages.append({
                    "role": "function",
                    "name": result["name"],
                    "content": json.dumps(result["results"])
                })

            # Get final response with function results
            final_api_params = {
                "model": kwargs.get("model", DEFAULT_MODEL),
                "messages": messages
            }
            final_response = await run_in_thread(
                openai_client.chat.completions.create, **final_api_params)

            return {
                "content": final_response.choices[0].message.content,
                "function_results": {
                    r["name"]: r["results"]
                    for r in valid_results
                }
            }

        return {"content": message.content, "function_results": None}
    except Exception as e:
        logger.error(f"Error in send_openai_request: {str(e)}")
        error_msg = str(e)
        if "API key" in error_msg:
            return {
                "content":
                "Error: OpenAI API key is not properly configured. Please check your environment variables.",
                "function_results": None
            }
        elif "model" in error_msg:
            # Try with a fallback model
            try:
                kwargs["model"] = "gpt-4o"
                return await send_openai_request(prompt, **kwargs)
            except:
                return {
                    "content":
                    "Error: Unable to access OpenAI models. Please try again later.",
                    "function_results": None
                }
        else:
            return {
                "content":
                "I apologize, but I encountered an error. Please try again or contact support if the issue persists.",
                "function_results": None
            }


async def get_ai_insights(question: str, context: dict) -> Dict[str, Any]:
    """Get AI insights with improved intent recognition and data access."""
    try:
        # Print the incoming question and context
        # print(f"Received question: {question}")
        # print(f"Received context: {context}")

        # Extract columns from context
        columns = context.get('columns') or context.get('metadata', {}).get('column_names', [])
        
        # Ensure columns are available
        if not columns:
            print("Columns are not defined in the context")
            return {
                'answer': "I couldn't determine the columns from the data. Please ensure the data is correctly formatted.",
                'visualization': None,
                'web_search_used': False
            }
        
        # First check if we have data in the context
        data = context.get('data', [])
        if not data:
            print("Data is not defined in the context")
            return {
                'answer': "I don't see any data loaded yet. Please upload your data first.",
                'visualization': None,
                'web_search_used': False
            }

        # Convert data to DataFrame for analysis
        df = pd.DataFrame(data)
        if df.empty:
            print("The data appears to be empty")
            return {
                'answer': "The data appears to be empty. Please upload valid data.",
                'visualization': None,
                'web_search_used': False
            }

        # Print the DataFrame summary
        # print(f"DataFrame summary:\n{df.describe(include='all')}")

        # Check if this is a direct visualization request for balance vs age
        if "show me a multi line chart with balance versus age data" in question.lower():
            if "age" not in df.columns or "balance" not in df.columns:
                return {
                    'answer': "I cannot create this visualization because the data doesn't contain both 'age' and 'balance' columns.",
                    'visualization': None,
                    'web_search_used': False
                }
            
            # Create the visualization directly
            viz_config = await create_visualization({
                "chart_type": "line",
                "title": "Balance vs Age Analysis",
                "should_visualize": True
            }, data)
            
            if viz_config:
                return {
                    'answer': "Here's a multi-line chart showing the relationship between balance and age. The data points are connected to help visualize the trend.",
                    'visualization': viz_config,
                    'web_search_used': False
                }

        # Prepare data context for the AI
        data_info = {
            'total_rows': len(df),
            'columns': list(df.columns),
            'numeric_columns': list(df.select_dtypes(include=[np.number]).columns),
            'categorical_columns': list(df.select_dtypes(exclude=[np.number]).columns),
            'sample_data': df.head(3).to_dict('records'),
            'column_descriptions': {col: {
                'dtype': str(df[col].dtype),
                'unique_values': len(df[col].unique()),
                'sample_values': df[col].head(3).tolist()
            } for col in df.columns}
        }
        print(f"Data info: {data_info}")

        # Prepare system prompt with clear instructions and data context
        system_prompt = f"""You are a versatile data analysis assistant that output HTML. You can:
1. Have normal conversations without creating visualizations
2. Analyze data and provide insights when asked
3. Create visualizations only when explicitly requested or when it would significantly enhance the answer

Current Data Summary:
- Total rows: {data_info['total_rows']}
- Columns: {', '.join(data_info['columns'])}
- Numeric columns: {', '.join(data_info['numeric_columns'])}
- Categorical columns: {', '.join(data_info['categorical_columns'])}

For each user message:
- If it's a casual conversation (like greetings, general questions), respond naturally without data analysis
- If it's a question about the data, provide a clear textual analysis using the available data
- Only create visualizations if:
  a) The user explicitly requests one
  b) The question is specifically about trends, patterns, or comparisons that would be clearer with a visual
  c) The data analysis would be significantly enhanced by a visualization

When creating visualizations:
- For time series or trends: Use line charts
- For comparisons between categories: Use bar charts
- For relationships between numeric variables: Use scatter plots
- For part-to-whole relationships: Use pie charts

You will respond in clean, proper HTML so the application can render it straight away. Normal text will be wrapped in a <p> tag. You will format the links as html links with an <a> tag. Links will have yellow font. Use divs and headings to properly separate different sections. Make sure text doesn't overlap and there is adequate line spacing. You will only output pure HTML. No markdown. All answers, titles, lists, headers, paragraphs - reply in fully styled HTML as the app will render and parse your responses as you reply. Only if you are asked about some programming problem that requires to send a code, you will use white font for only the code part, explanation part would be normal. Don't use ```html at the start and do not end with ``` anywhere. Do not output any text afterwards.
DO NOT USE CANVAS TO OUTPUT CHARTS. MAKE SURE ALL CONTENT YOU OUTPUT IS IN A DIV THAT HAS MAX WIDTH 300px. MAKE SURE TO KEEP ANY LEGENDS SMALL.
DO NOT OUTPUT ANY MARKDOWN. ONLY OUTPUT HTML. 

EXAMPLE HTML FOR CHARTS:

<div style="width: 300px; margin-bottom: 40px;">
        <div style="text-align: center; margin-bottom: 10px; font-weight: bold; font-size: 14px;">Pie Chart</div>
        <div style="width: 200px; height: 200px; border-radius: 50%; background: conic-gradient(#3498db 0deg 90deg, #e74c3c 90deg 180deg, #2ecc71 180deg 270deg, #f1c40f 270deg 360deg); margin: 0 auto; position: relative;">
            <div class="hover-area" data-label="Category A" data-value="25%" style="position: absolute; width: 50%; height: 50%; top: 0; left: 50%; transform-origin: 0% 100%; transform: rotate(0deg) skew(0deg);"></div>
            <div class="hover-area" data-label="Category B" data-value="25%" style="position: absolute; width: 50%; height: 50%; top: 0; left: 50%; transform-origin: 0% 100%; transform: rotate(90deg) skew(0deg);"></div>
            <div class="hover-area" data-label="Category C" data-value="25%" style="position: absolute; width: 50%; height: 50%; top: 0; left: 50%; transform-origin: 0% 100%; transform: rotate(180deg) skew(0deg);"></div>
            <div class="hover-area" data-label="Category D" data-value="25%" style="position: absolute; width: 50%; height: 50%; top: 0; left: 50%; transform-origin: 0% 100%; transform: rotate(270deg) skew(0deg);"></div>
        </div>
        <div style="display: flex; justify-content: center; flex-wrap: wrap; margin-top: 10px; font-size: 12px;">
            <div style="display: flex; align-items: center; margin: 0 5px;">
                <div style="width: 10px; height: 10px; margin-right: 3px; background-color: #3498db;"></div>
                <span>Category A</span>
            </div>
            <div style="display: flex; align-items: center; margin: 0 5px;">
                <div style="width: 10px; height: 10px; margin-right: 3px; background-color: #e74c3c;"></div>
                <span>Category B</span>
            </div>
            <div style="display: flex; align-items: center; margin: 0 5px;">
                <div style="width: 10px; height: 10px; margin-right: 3px; background-color: #2ecc71;"></div>
                <span>Category C</span>
            </div>
            <div style="display: flex; align-items: center; margin: 0 5px;">
                <div style="width: 10px; height: 10px; margin-right: 3px; background-color: #f1c40f;"></div>
                <span>Category D</span>
            </div>
        </div>
    </div>

    <div style="width: 300px; margin-bottom: 40px;">
        <div style="text-align: center; margin-bottom: 10px; font-weight: bold; font-size: 14px;">Bar Chart</div>
        <div style="width: 300px; height: 200px; border-bottom: 2px solid white; border-left: 2px solid white; margin: 0 auto; position: relative; display: flex; align-items: flex-end; justify-content: space-around;">
            <div class="hover-area" data-label="A" data-value="60%" style="width: 40px; background-color: #3498db; height: 60%;"></div>
            <div class="hover-area" data-label="B" data-value="80%" style="width: 40px; background-color: #3498db; height: 80%;"></div>
            <div class="hover-area" data-label="C" data-value="40%" style="width: 40px; background-color: #3498db; height: 40%;"></div>
            <div class="hover-area" data-label="D" data-value="100%" style="width: 40px; background-color: #3498db; height: 100%;"></div>
            <div class="hover-area" data-label="E" data-value="70%" style="width: 40px; background-color: #3498db; height: 70%;"></div>
            <div style="position: absolute; color: white; font-size: 10px; bottom: -20px; left: 50%; transform: translateX(-50%);">Categories</div>
            <div style="position: absolute; color: white; font-size: 10px; top: 50%; left: -20px; transform: translateY(-50%) rotate(-90deg);">Value</div>
            <div style="position: absolute; color: white; font-size: 8px; bottom: -15px; left: 10%;">A</div>
            <div style="position: absolute; color: white; font-size: 8px; bottom: -15px; left: 30%;">B</div>
            <div style="position: absolute; color: white; font-size: 8px; bottom: -15px; left: 50%;">C</div>
            <div style="position: absolute; color: white; font-size: 8px; bottom: -15px; left: 70%;">D</div>
            <div style="position: absolute; color: white; font-size: 8px; bottom: -15px; left: 90%;">E</div>
            <div style="position: absolute; color: white; font-size: 8px; left: -15px; bottom: 0;">0</div>
            <div style="position: absolute; color: white; font-size: 8px; left: -15px; bottom: 25%;">25</div>
            <div style="position: absolute; color: white; font-size: 8px; left: -15px; bottom: 50%;">50</div>
            <div style="position: absolute; color: white; font-size: 8px; left: -15px; bottom: 75%;">75</div>
            <div style="position: absolute; color: white; font-size: 8px; left: -20px; bottom: 100%;">100</div>
        </div>
        <div style="display: flex; justify-content: center; flex-wrap: wrap; margin-top: 10px; font-size: 12px;">
            <div style="display: flex; align-items: center; margin: 0 10px;">
                <div style="width: 10px; height: 10px; margin-right: 3px; background-color: #3498db;"></div>
                <span>Data Series</span>
            </div>
        </div>
    </div>

    <div style="width: 300px; margin-bottom: 40px;">
        <div style="text-align: center; margin-bottom: 10px; font-weight: bold; font-size: 14px;">Scatter Plot</div>
        <div style="width: 300px; height: 200px; border-bottom: 2px solid white; border-left: 2px solid white; margin: 0 auto; position: relative;">
            <div class="hover-area" data-label="Point 1" data-value="(20, 30)" style="width: 8px; height: 8px; background-color: #3498db; border-radius: 50%; position: absolute; left: 20%; bottom: 30%;"></div>
            <div class="hover-area" data-label="Point 2" data-value="(40, 70)" style="width: 8px; height: 8px; background-color: #3498db; border-radius: 50%; position: absolute; left: 40%; bottom: 70%;"></div>
            <div class="hover-area" data-label="Point 3" data-value="(60, 50)" style="width: 8px; height: 8px; background-color: #3498db; border-radius: 50%; position: absolute; left: 60%; bottom: 50%;"></div>
            <div class="hover-area" data-label="Point 4" data-value="(80, 20)" style="width: 8px; height: 8px; background-color: #3498db; border-radius: 50%; position: absolute; left: 80%; bottom: 20%;"></div>
            <div class="hover-area" data-label="Point 5" data-value="(30, 60)" style="width: 8px; height: 8px; background-color: #3498db; border-radius: 50%; position: absolute; left: 30%; bottom: 60%;"></div>
            <div class="hover-area" data-label="Point 6" data-value="(70, 80)" style="width: 8px; height: 8px; background-color: #3498db; border-radius: 50%; position: absolute; left: 70%; bottom: 80%;"></div>
            <div class="hover-area" data-label="Point 7" data-value="(50, 40)" style="width: 8px; height: 8px; background-color: #3498db; border-radius: 50%; position: absolute; left: 50%; bottom: 40%;"></div>
            <div style="position: absolute; color: white; font-size: 10px; bottom: -20px; left: 50%; transform: translateX(-50%);">X Axis</div>
            <div style="position: absolute; color: white; font-size: 10px; top: 50%; left: -20px; transform: translateY(-50%) rotate(-90deg);">Y Axis</div>
            <div style="position: absolute; color: white; font-size: 8px; bottom: -15px; left: 0;">0</div>
            <div style="position: absolute; color: white; font-size: 8px; bottom: -15px; left: 25%;">25</div>
            <div style="position: absolute; color: white; font-size: 8px; bottom: -15px; left: 50%;">50</div>
            <div style="position: absolute; color: white; font-size: 8px; bottom: -15px; left: 75%;">75</div>
            <div style="position: absolute; color: white; font-size: 8px; bottom: -15px; right: -5px;">100</div>
            <div style="position: absolute; color: white; font-size: 8px; left: -15px; bottom: 0;">0</div>
            <div style="position: absolute; color: white; font-size: 8px; left: -15px; bottom: 25%;">25</div>
            <div style="position: absolute; color: white; font-size: 8px; left: -15px; bottom: 50%;">50</div>
            <div style="position: absolute; color: white; font-size: 8px; left: -15px; bottom: 75%;">75</div>
            <div style="position: absolute; color: white; font-size: 8px; left: -20px; bottom: 100%;">100</div>
        </div>
        <div style="display: flex; justify-content: center; flex-wrap: wrap; margin-top: 10px; font-size: 12px;">
            <div style="display: flex; align-items: center; margin: 0 10px;">
                <div style="width: 10px; height: 10px; margin-right: 3px; background-color: #3498db;"></div>
                <span>Data Points</span>
            </div>
        </div>
    </div>

    <div id="tooltip" style="position: fixed; background-color: rgba(255,255,255,0.9); color: black; padding: 5px 10px; border-radius: 5px; font-size: 12px; pointer-events: none; display: none;"></div>


Remember: Not every data-related question needs a visualization. You can output these visualizations directly in vanilla HTML and CSS and the frontend will render them"""

        # Define functions for visualization
        functions = [{
            "name": "create_visualization",
            "description": "Create a data visualization",
            "parameters": {
                "type": "object",
                "properties": {
                    "chart_type": {
                        "type": "string",
                        "enum": ["bar", "line", "scatter", "pie"],
                        "description": "Type of chart to create"
                    },
                    "title": {
                        "type": "string",
                        "description": "Chart title"
                    },
                    "should_visualize": {
                        "type": "boolean",
                        "description": "Whether a visualization should be created"
                    }
                },
                "required": ["should_visualize", "chart_type", "title"]
            }
        }]

        # Send request to OpenAI with data context
        response = await send_openai_request(
            question,
            system_prompt=system_prompt,
            # functions=functions,
            context={'data': data, 'data_info': data_info},
            previous_messages=context.get('conversation_history', [])
        )

        # Extract the response
        if isinstance(response, dict) and 'function_call' in response:
            # Check if visualization was recommended
            try:
                args = json.loads(response['function_call']['arguments'])
                should_visualize = args.get('should_visualize', False)
                
                if not should_visualize:
                    return {
                        'answer': response.get('content', 'I understand your question. ') +
                                (response.get('additional_response', '')),
                        'visualization': None,
                        'web_search_used': False
                    }
                
                # If visualization is needed, proceed with the existing visualization logic
                viz_config = await create_visualization(args, data)
                if viz_config:
                    return {
                        'answer': response.get('content', 'Here\'s a visualization of the data. ') +
                                (response.get('additional_response', '')),
                        'visualization': viz_config,
                        'web_search_used': False
                    }
                else:
                    return {
                        'answer': "I apologize, but I couldn't create the visualization. " + 
                                response.get('content', ''),
                        'visualization': None,
                        'web_search_used': False
                    }
            except json.JSONDecodeError:
                logger.error("Error parsing function call arguments")
                return {
                    'answer': response.get('content', 'I understand your question, but there was an error creating the visualization.'),
                    'visualization': None,
                    'web_search_used': False
                }
        else:
            # Return just the text response for conversational queries
            return {
                'answer': response.get('content', 'I understand your question.'),
                'visualization': None,
                'web_search_used': False
            }

    except Exception as e:
        # print(f"Error in get_ai_insights: {str(e)}")
        return {
            'answer': "I apologize, but I encountered an error while processing your request.",
            'visualization': None,
            'web_search_used': False
        }
