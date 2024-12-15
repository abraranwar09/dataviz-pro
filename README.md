# DataLens Tool

DataLens Tool is an advanced data visualization and analysis web application that leverages Perplexity AI to enable intelligent document interaction and insights generation.

## Key Features

- **Flask Backend**: A robust backend built with Flask to handle requests and serve the application.
- **Vanilla JavaScript Frontend**: A dynamic and interactive frontend using vanilla JavaScript.
- **Perplexity AI Integration**: Utilizes AI for intelligent data analysis and insights.
- **PostgreSQL Database**: Stores and manages data efficiently.
- **Interactive AI-powered Document Analysis Tools**: Provides tools for analyzing and visualizing data.

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **Set up a virtual environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use `venv\Scripts\activate`
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**:
   - Create a `.env` file in the root directory.
   - Add your OpenAI API key and any other necessary environment variables.

5. **Run the application**:
   ```bash
   python app.py
   ```

## Usage

- **Upload Data**: Drag and drop your data file into the application. Supported formats include CSV, TSV, Excel, and JSON.
- **Analyze Data**: Use the AI-powered tools to analyze and visualize your data.
- **Save Sessions**: Save your analysis sessions for future reference.

## Dependencies

- Python 3.11 or higher
- Flask
- Pandas
- NumPy
- SQLAlchemy
- OpenAI
- PyArrow

## Troubleshooting

- Ensure all dependencies are installed correctly.
- Check that your environment variables are set up properly.
- If you encounter issues with NumPy or PyArrow, consider downgrading NumPy to a version below 2.0 as a temporary fix.

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request for any improvements or bug fixes.

## License

This project is licensed under the MIT License.

## Contact

For any questions or support, please contact [Your Name] at [Your Email].
