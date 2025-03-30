import React, { useState, useEffect } from 'react';

interface Tab {
  id: string;
  name: string;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  children: React.ReactNode;
  onChange?: (tabId: string) => void;
  initialTabId?: string;
}

export function Tabs({ tabs, children, onChange, initialTabId }: TabsProps) {
  const [selectedTab, setSelectedTab] = useState<string>(initialTabId || tabs[0]?.id || '');

  useEffect(() => {
    if (initialTabId && initialTabId !== selectedTab) {
      setSelectedTab(initialTabId);
    }
  }, [initialTabId]);

  const handleTabChange = (tabId: string) => {
    setSelectedTab(tabId);
    if (onChange) {
      onChange(tabId);
    }
  };

  return (
    <div>
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${selectedTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
              aria-current={selectedTab === tab.id ? 'page' : undefined}
            >
              <div className="flex items-center">
                {tab.icon && <span className="mr-2">{tab.icon}</span>}
                {tab.name}
              </div>
            </button>
          ))}
        </nav>
      </div>
      <div className="mt-6">
        {React.Children.toArray(children).find((child, index) => {
          if (React.isValidElement(child) && child.props.id === selectedTab) {
            return true;
          }
          // Si no hay ID específico, usamos el índice del array de tabs
          return React.isValidElement(child) && index === tabs.findIndex(tab => tab.id === selectedTab);
        })}
      </div>
    </div>
  );
}

interface TabPanelProps {
  id: string;
  children: React.ReactNode;
}

export function TabPanel({ children, id }: TabPanelProps) {
  return (
    <div id={id} role="tabpanel" tabIndex={0}>
      {children}
    </div>
  );
} 