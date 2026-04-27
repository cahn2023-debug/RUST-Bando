---
name: code-reviewer
description: Chuyên gia review code cho Rust (Tauri), TypeScript, JavaScript. Tích hợp cargo clippy, check, phân tích Ownership/Borrowing và các pattern của Tauri. Dùng để kiểm tra pull requests, đánh giá chất lượng code định kỳ và phát hiện code smells trong hệ sinh thái Rust.
---

# Code Reviewer (Rust & Tauri Optimized)

Bộ công cụ review code chuyên sâu cho dự án Rust/Tauri. Tự động hóa việc kiểm tra lỗi biên dịch, cảnh báo linter và các anti-pattern phổ biến.

## Quick Start

### Main Capabilities

Skill này cung cấp 3 khả năng cốt lõi thông qua các script tự động:

```bash
# Script 1: Phân tích Project (Cargo metadata & structure)
python scripts/pr_analyzer.py [options]

# Script 2: Kiểm tra chất lượng (Cargo clippy & check)
python scripts/code_quality_checker.py [options]

# Script 3: Tổng hợp báo cáo Review
python scripts/review_report_generator.py [options]
```

## Core Capabilities

### 1. Pr Analyzer (Rust Focused)

Công cụ phân tích cấu trúc project Rust và Tauri.

**Features:**
- Phân tích `Cargo.toml` (dependencies, workspace)
- Kiểm tra tính nhất quán giữa frontend/backend (Tauri commands)
- Scaffolding cho các module mới đúng chuẩn
- Kiểm tra file rác (dead logic).

**Usage:**
```bash
python scripts/pr_analyzer.py <project-path> [options]
```

### 2. Code Quality Checker (Cargo Integration)

Tích hợp trực tiếp với trình biên dịch và linter của Rust.

**Features:**
- Tích hợp `cargo clippy --message-format=json`
- Tích hợp `cargo check` cho feedback nhanh
- Phân tích logic `Option/Result` và `unwrap()` bừa bãi
- Cảnh báo về Ownership, Borrowing và Lifetimes.

**Usage:**
```bash
python scripts/code_quality_checker.py <target-path> [--verbose]
```

### 3. Review Report Generator

Tổng hợp báo cáo chất lượng code và đề xuất refactor.

**Usage:**
```bash
python scripts/review_report_generator.py [arguments] [options]
```

## Tech Stack

**Languages:** Rust (Core), TypeScript, JavaScript, Python
**Backend:** Tauri (Rust), Tokio (Async runtime)
**Frontend:** React, HTML/CSS (Vanilla)
**Database:** SQL (SQLite), JSON Storage
**DevOps:** Cargo, GitHub Actions

## Development Workflow

### 1. Setup and Configuration

```bash
# Install dependencies
npm install
# or
pip install -r requirements.txt

# Configure environment
cp .env.example .env
```

### 2. Run Quality Checks

```bash
# Use the analyzer script
python scripts/code_quality_checker.py .

# Review recommendations
# Apply fixes
```

### 3. Implement Best Practices

Follow the patterns and practices documented in:
- `references/code_review_checklist.md`
- `references/coding_standards.md`
- `references/common_antipatterns.md`

## Best Practices Summary

### Code Quality
- Follow established patterns
- Write comprehensive tests
- Document decisions
- Review regularly

### Performance
- Measure before optimizing
- Use appropriate caching
- Optimize critical paths
- Monitor in production

### Security
- Validate all inputs
- Use parameterized queries
- Implement proper authentication
- Keep dependencies updated

### Maintainability
- Write clear code
- Use consistent naming
- Add helpful comments
- Keep it simple

## Common Commands

```bash
# Development
npm run dev
npm run build
npm run test
npm run lint

# Analysis
python scripts/code_quality_checker.py .
python scripts/review_report_generator.py --analyze

# Deployment
docker build -t app:latest .
docker-compose up -d
kubectl apply -f k8s/
```

## Troubleshooting

### Common Issues

Check the comprehensive troubleshooting section in `references/common_antipatterns.md`.

### Getting Help

- Review reference documentation
- Check script output messages
- Consult tech stack documentation
- Review error logs

## Resources

- Pattern Reference: `references/code_review_checklist.md`
- Workflow Guide: `references/coding_standards.md`
- Technical Guide: `references/common_antipatterns.md`
- Tool Scripts: `scripts/` directory
