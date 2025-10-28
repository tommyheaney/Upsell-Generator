
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ProductData, RecommendationResult } from './types';
import { parseExcel, generateExcel } from './utils/spreadsheetHelper';
import { generateRecommendations } from './services/geminiService';

import FileUpload from './components/FileUpload';
import ResultsTable from './components/ResultsTable';
import Loader from './components/Loader';
import { DownloadIcon } from './components/icons/DownloadIcon';
import { ProductIcon } from './components/icons/ProductIcon';
import { StopIcon } from './components/icons/StopIcon';


type AppState = 'idle' | 'loading' | 'success' | 'error' | 'cancelled' | 'cancelling';
interface ProgressState {
  processed: number;
  total: number;
}

const App: React.FC = () => {
  const [originalData, setOriginalData] = useState<ProductData[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [results, setResults] = useState<RecommendationResult[]>([]);
  const [appState, setAppState] = useState<AppState>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [successMessage, setSuccessMessage] = useState<{title: string, description: string} | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleFileUpload = useCallback((file: File) => {
    setAppState('loading');
    setError(null);
    setResults([]);
    setOriginalData([]);
    setHeaders([]);
    setFileName(file.name);
    setProgress(null);
    setSuccessMessage(null);

    parseExcel(file, (data, sheetHeaders) => {
        if (data.length === 0) {
            setError('The uploaded spreadsheet appears to be empty.');
            setAppState('error');
            return;
        }

        const requiredColumns = ['VS Parent ID', 'VS Child ID', 'Parent Product Title'];
        if (!requiredColumns.every(col => sheetHeaders.includes(col))) {
            setError(`Invalid file structure. Please ensure columns exist for: ${requiredColumns.join(', ')}.`);
            setAppState('error');
            return;
        }

        setOriginalData(data);
        setHeaders(sheetHeaders);

        const upselling1Header = 'Upselling 1 (Customers Also Bought)';
        const upselling2Header = 'Upselling 2 (You May Also Like)';
        if (sheetHeaders.includes(upselling1Header) && sheetHeaders.includes(upselling2Header)) {
            const existingResults: RecommendationResult[] = data
                .filter(row => row['VS Child ID'])
                .map(row => ({
                    vsChildId: String(row['VS Child ID']),
                    upselling1: row[upselling1Header] ? String(row[upselling1Header]).split(',').map(s => s.trim()) : [],
                    upselling2: row[upselling2Header] ? String(row[upselling2Header]).split(',').map(s => s.trim()) : [],
                }));
            
            setResults(existingResults);
            setSuccessMessage({ title: 'Preview Loaded', description: 'Your existing recommendations are shown below. You can re-generate them if you wish.' });
            setAppState('success');
        } else {
            setAppState('idle');
        }
    }, (err) => {
        setError(`Failed to parse spreadsheet: ${err.message}`);
        setAppState('error');
    });
  }, []);

  const handleGenerate = async () => {
    if (originalData.length === 0) return;

    setAppState('loading');
    setError(null);
    setResults([]); // Clear previous results before generating new ones
    setProgress({ processed: 0, total: originalData.length });
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const handleNewBatch = (batch: RecommendationResult[]) => {
        setResults(prev => [...prev, ...batch]);
      };
      
      await generateRecommendations(
        originalData, 
        (processed, total) => setProgress({ processed, total }),
        handleNewBatch,
        controller.signal
      );
      
      // Check if the process was aborted before declaring success
      if (controller.signal.aborted) {
        setError("Generation stopped by user.");
        setAppState('cancelled');
      } else {
        setSuccessMessage({ title: 'Success!', description: `${originalData.length} products have been processed with new recommendations.` });
        setAppState('success');
      }

    } catch (err) {
       if (controller.signal.aborted) {
        setError("Generation stopped by user.");
        setAppState('cancelled');
      } else {
        setError(`An error occurred: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setAppState('error');
      }
    } finally {
        setProgress(null);
        abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        setAppState('cancelling');
    }
  };
  
  const handleDownload = () => {
    const blob = generateExcel(originalData, results, headers);
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'product_recommendations.xlsx');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  useEffect(() => {
    // Scroll to results only on initial successful load or completion, not during streaming
    if (appState === 'success' && results.length > 0 && progress === null) {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [appState, results.length, progress]);

  const isGenerateDisabled = originalData.length === 0 || appState === 'loading' || appState === 'cancelling';
  const isDownloadDisabled = results.length === 0;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-800">
            AI Bathroom Upsell Generator
          </h1>
          <p className="mt-2 text-lg text-slate-600">
            Automatically create product bundles and recommendations from your catalog.
          </p>
        </header>

        <main className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            {/* Left Column: Upload and Control */}
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-700 mb-2">Step 1: Upload Your Product Spreadsheet</h2>
                <p className="text-sm text-slate-500 mb-4">Upload an XLSX file to generate new recommendations or preview existing ones.</p>
                <FileUpload onFileUpload={handleFileUpload} disabled={appState === 'loading' || appState === 'cancelling'} />
              </div>

              {fileName && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700">
                  <p><strong>Uploaded File:</strong> {fileName}</p>
                  <p><strong>Products Found:</strong> {originalData.length}</p>
                </div>
              )}

              <div>
                <h2 className="text-xl font-semibold text-slate-700 mb-2">Step 2: Generate Upsells</h2>
                <p className="text-sm text-slate-500 mb-4">Click 'Generate' to create recommendations. You can stop the process at any time.</p>
                 {appState === 'loading' || appState === 'cancelling' ? (
                    <button
                      onClick={handleStop}
                      disabled={appState === 'cancelling'}
                      className={`w-full flex items-center justify-center gap-2 text-white font-semibold py-3 px-4 rounded-lg shadow-md transition-all duration-200 ${
                        appState === 'cancelling' 
                        ? 'bg-yellow-500 cursor-wait' 
                        : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      <StopIcon />
                      {appState === 'cancelling' ? 'Stopping...' : 'Stop Generation'}
                    </button>
                  ) : (
                    <button
                      onClick={handleGenerate}
                      disabled={isGenerateDisabled}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-3 px-4 rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      <ProductIcon />
                      Generate Upsells
                    </button>
                  )}
              </div>
            </div>

            {/* Right Column: Status and Download */}
            <div className="bg-slate-50/70 rounded-xl p-6 min-h-[200px] flex flex-col items-center justify-center">
              {(appState === 'loading' || appState === 'cancelling') && <Loader progress={progress} cancelling={appState === 'cancelling'} />}
              {appState === 'idle' && !results.length && (
                 <div className="text-center text-slate-500">
                    <p className="font-semibold">Ready to begin.</p>
                    <p>Upload a file and click 'Generate'.</p>
                </div>
              )}
              {(appState === 'error' || appState === 'cancelled') && <p className="text-red-600 font-semibold text-center">{error}</p>}
              
              {(appState === 'success' || (results.length > 0 && (appState === 'cancelled' || appState === 'error'))) && (
                 <div className="text-center space-y-4 w-full">
                    {appState === 'success' && successMessage && (
                        <>
                            <h2 className="text-2xl font-bold text-green-600">{successMessage.title}</h2>
                            <p className="text-slate-600">{successMessage.description}</p>
                        </>
                    )}
                    <button
                      onClick={handleDownload}
                      disabled={isDownloadDisabled}
                      className="w-full flex items-center justify-center gap-2 bg-green-600 text-white font-semibold py-3 px-4 rounded-lg shadow-md hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      <DownloadIcon />
                      Download { appState === 'cancelled' ? 'Partial ' : '' }Spreadsheet
                    </button>
                 </div>
              )}
            </div>
          </div>
          
          {results.length > 0 && (
            <div ref={resultsRef} className="mt-8 pt-8 border-t border-slate-200">
              <h3 className="text-2xl font-bold text-slate-800 mb-4 text-center">Result Preview</h3>
              <ResultsTable results={results} originalData={originalData} />
            </div>
          )}
        </main>
        
        <footer className="text-center mt-8 text-slate-500 text-sm">
            <p>&copy; {new Date().getFullYear()} Bathroom Upsell Generator. Powered by AI.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
