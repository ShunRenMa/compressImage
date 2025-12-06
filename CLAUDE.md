# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language Instructions

When communicating with users, always use Traditional Chinese (繁體中文) unless the user specifically requests English or another language.

## Project Overview

圖片壓縮轉檔工具 - 基於 Web 的客戶端圖片處理應用程式。
設計先不做，以最陽春的方式呈現，功能優先。

## Project Structure

- **根目錄** - 主專案（開發中）
- **compressImage2/** - 參考實作範例（僅供參考指令用法）

## Reference Commands (from compressImage2)

```bash
cd compressImage2
npm install
npm run build
npx tsc --noEmit
```

## Core Features to Implement

- 支援 JPEG、PNG、WEBP 格式壓縮與轉換
- 等比縮放功能
- 品質調整（低/中/高）
- 批次處理

## Technical Reference

- FFmpeg.wasm 用於客戶端圖片處理
- FFmpeg 縮放參數：`scale=${width}:${height}:force_original_aspect_ratio=decrease`
- 依賴：`@ffmpeg/ffmpeg`、`@ffmpeg/util`、`jszip`
