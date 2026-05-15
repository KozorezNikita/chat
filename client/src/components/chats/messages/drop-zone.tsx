"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { Upload } from "lucide-react";

interface DropZoneProps {
  /** Викликається коли файл droppнули. */
  onFileDropped: (file: File) => void;
  children: ReactNode;
}

/**
 * ============================================
 * DropZone — drag-and-drop wrapper для chat area
 * ============================================
 *
 * Відстежує dragenter/dragleave/drop по всьому контейнеру. Overlay
 * з'являється коли файл тащиться над зоною — "Відпустіть для надсилання".
 *
 * Counter-based dragenter/leave — щоб уникнути flickering коли курсор
 * проходить над дочірніми елементами (кожен child triggers dragleave parent).
 */
export function DropZone({ onFileDropped, children }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Перевіряємо чи це справді файл (а не текст-select drag з іншої частини UI)
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounter.current++;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // обов'язковий для drop спрацював
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        onFileDropped(file);
      }
    },
    [onFileDropped],
  );

  // Reset counter якщо юзер swap-нув tab під час drag
  useEffect(() => {
    const handleWindowDragEnd = () => {
      dragCounter.current = 0;
      setIsDragging(false);
    };
    window.addEventListener("dragend", handleWindowDragEnd);
    return () => window.removeEventListener("dragend", handleWindowDragEnd);
  }, []);

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-primary bg-card/90 px-8 py-6 shadow-lg">
            <Upload className="mx-auto mb-2 h-8 w-8 text-primary" />
            <div className="text-sm font-medium text-foreground">
              Відпустіть для надсилання
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
