"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";

interface CodeTabProps {
    tabs: {
        label: string;
        code: string;
        language: string;
    }[];
}

export const CodeTabs = ({ tabs }: CodeTabProps) => {
    const [activeTab, setActiveTab] = useState(0);
    const [copied, setCopied] = useState(false);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Convert hljs language names to prism language names if needed
    const getPrismLanguage = (language: string) => {
        const mapping: Record<string, string> = {
            typescript: "tsx",
            javascript: "jsx",
            bash: "bash",
        };
        return mapping[language] || language;
    };

    const activeCode = tabs[activeTab].code;
    const activeLanguage = getPrismLanguage(tabs[activeTab].language);

    return (
        <div className="rounded-lg overflow-hidden border border-gray-200 mb-6">
            <div className="flex bg-gray-100">
                {tabs.map((tab, index) => (
                    <button
                        key={index}
                        onClick={() => setActiveTab(index)}
                        className={`px-4 py-2 text-sm font-medium ${activeTab === index ? "bg-white text-purple-600 border-t-2 border-purple-500" : "text-gray-600 hover:text-purple-500"}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className="relative">
                <button onClick={() => copyToClipboard(activeCode)} className="absolute top-2 right-2 p-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 z-10" aria-label="Copy code">
                    {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>

                <Highlight theme={themes.nightOwl} code={activeCode} language={activeLanguage}>
                    {({ style, tokens, getLineProps, getTokenProps }) => (
                        <pre className="overflow-x-auto text-sm p-4 m-0" style={style}>
                            {tokens.map((line, i) => (
                                <div key={i} {...getLineProps({ line })}>
                                    {line.map((token, key) => (
                                        <span key={key} {...getTokenProps({ token })} />
                                    ))}
                                </div>
                            ))}
                        </pre>
                    )}
                </Highlight>
            </div>
        </div>
    );
};
