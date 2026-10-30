// 표 → CSV(엑셀에서 한글이 깨지지 않게 맨 앞에 BOM). 칸에 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싼다.

/** @param {unknown} value */
function cell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * @param {Array<Array<unknown>>} rows 첫 줄은 머리글
 */
export function toCsv(rows) {
  return `﻿${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}

/**
 * 브라우저에서 CSV 파일 받기.
 * @param {string} fileName @param {Array<Array<unknown>>} rows
 */
export function downloadCsv(fileName, rows) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
