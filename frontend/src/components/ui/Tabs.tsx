import React, { createContext, useContext, useState } from 'react'
import { cn } from './cn'

interface TabsContextType {
  value: string
  onValueChange: (val: string) => void
}

const TabsContext = createContext<TabsContextType | undefined>(undefined)

export interface TabsProps {
  defaultValue: string
  value?: string
  onValueChange?: (val: string) => void
  children: React.ReactNode
  className?: string
}

export function Tabs({ defaultValue, value, onValueChange, children, className }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultValue)
  
  const currentTab = value !== undefined ? value : activeTab
  const changeTab = onValueChange !== undefined ? onValueChange : setActiveTab

  return (
    <TabsContext.Provider value={{ value: currentTab, onValueChange: changeTab }}>
      <div className={cn("w-full space-y-4", className)}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

export interface TabsListProps {
  children: React.ReactNode
  className?: string
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div className={cn("flex p-1 gap-1 rounded-xl bg-surface-2/60 border border-border/80 w-fit", className)}>
      {children}
    </div>
  )
}

export interface TabsTriggerProps {
  value: string
  children: React.ReactNode
  className?: string
}

export function TabsTrigger({ value, children, className }: TabsTriggerProps) {
  const context = useContext(TabsContext)
  if (!context) throw new Error("TabsTrigger must be used inside Tabs")

  const isActive = context.value === value

  return (
    <button
      onClick={() => context.onValueChange(value)}
      className={cn(
        "px-4 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer select-none",
        isActive 
          ? "bg-primary text-white shadow-sm font-bold" 
          : "text-text-muted hover:text-text hover:bg-surface-2",
        className
      )}
    >
      {children}
    </button>
  )
}

export interface TabsContentProps {
  value: string
  children: React.ReactNode
  className?: string
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const context = useContext(TabsContext)
  if (!context) throw new Error("TabsContent must be used inside Tabs")

  if (context.value !== value) return null

  return (
    <div className={cn("animate-fade-in focus:outline-none", className)}>
      {children}
    </div>
  )
}
