#!/usr/bin/env python3
"""
Code Quality Checker
Automated tool for code reviewer tasks
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import Dict, List, Optional

import subprocess

class CodeQualityChecker:
    """Main class for code quality checker functionality optimized for Rust/Tauri"""
    
    def __init__(self, target_path: str, verbose: bool = False):
        self.target_path = Path(target_path)
        self.verbose = verbose
        self.results = {'status': 'pending', 'findings': [], 'errors': []}
    
    def run(self) -> Dict:
        """Execute the main functionality"""
        print(f"🚀 Running Rust Code Quality Checker...")
        print(f"📁 Target: {self.target_path}")
        
        try:
            self.validate_target()
            self.analyze_rust()
            self.generate_report()
            
            print("✅ Completed successfully!")
            return self.results
            
        except Exception as e:
            print(f"❌ Error: {e}")
            return self.results
    
    def validate_target(self):
        """Validate the target path contains a Cargo.toml"""
        if not self.target_path.exists():
            raise ValueError(f"Target path does not exist: {self.target_path}")
        
        cargo_path = self.target_path / "Cargo.toml"
        src_tauri_cargo = self.target_path / "src-tauri" / "Cargo.toml"
        
        if not cargo_path.exists() and not src_tauri_cargo.exists():
            print("⚠️ Warning: No Cargo.toml found in target or src-tauri. Is this a Rust project?")
    
    def analyze_rust(self):
        """Perform analysis using cargo clippy and check"""
        cwd = self.target_path
        if (cwd / "src-tauri").exists():
            cwd = cwd / "src-tauri"
            
        if self.verbose:
            print(f"📊 Running 'cargo check' in {cwd}...")

        # Run cargo check
        try:
            check_proc = subprocess.run(
                ["cargo", "check", "--message-format=json"],
                cwd=cwd,
                capture_output=True,
                text=True,
                encoding='utf-8'
            )
            self._parse_cargo_output(check_proc.stdout)
        except Exception as e:
            self.results['errors'].append(str(e))

        if self.verbose:
            print(f"📊 Running 'cargo clippy' in {cwd}...")

        # Run cargo clippy
        try:
            clippy_proc = subprocess.run(
                ["cargo", "clippy", "--message-format=json", "--", "-D", "warnings"],
                cwd=cwd,
                capture_output=True,
                text=True,
                encoding='utf-8'
            )
            self._parse_cargo_output(clippy_proc.stdout)
        except Exception as e:
            self.results['errors'].append(str(e))

        self.results['status'] = 'success' if not self.results['errors'] else 'partial_success'

    def _parse_cargo_output(self, stdout: str):
        for line in stdout.splitlines():
            try:
                data = json.loads(line)
                if data.get('reason') == 'compiler-message':
                    msg = data.get('message', {})
                    level = msg.get('level')
                    if level in ['warning', 'error']:
                        spans = msg.get('spans', [])
                        file_name = spans[0].get('file_name') if spans else "unknown"
                        line_start = spans[0].get('line_start') if spans else "?"
                        
                        finding = {
                            'level': level,
                            'message': msg.get('message'),
                            'file': file_name,
                            'line': line_start,
                            'code': msg.get('code', {}).get('code') if msg.get('code') else None
                        }
                        if finding not in self.results['findings']:
                            self.results['findings'].append(finding)
            except:
                continue

    def generate_report(self):
        """Generate and display the report"""
        findings = self.results.get('findings', [])
        errors = self.results.get('errors', [])
        
        print("\n" + "="*60)
        print("RUST CODE QUALITY REPORT")
        print("="*60)
        print(f"Target Project: {self.target_path}")
        print(f"Total Findings: {len(findings)}")
        
        if errors:
            print("\n❌ EXECUTION ERRORS:")
            for err in errors:
                print(f"  - {err}")

        if findings:
            print("\n🔍 FINDINGS BY FILE:")
            files = sorted(list(set(f['file'] for f in findings)))
            for f_path in files:
                file_findings = [f for f in findings if f['file'] == f_path]
                print(f"\n📄 {f_path}:")
                for f in file_findings:
                    icon = "⚠️" if f['level'] == 'warning' else "🚨"
                    code_str = f" [{f['code']}]" if f['code'] else ""
                    print(f"  {icon} L{f['line']}: {f['message']}{code_str}")
        else:
            print("\n✨ No issues found! Your code is clean.")
            
        print("\n" + "="*60 + "\n")

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="Code Quality Checker"
    )
    parser.add_argument(
        'target',
        help='Target path to analyze or process'
    )
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Enable verbose output'
    )
    parser.add_argument(
        '--json',
        action='store_true',
        help='Output results as JSON'
    )
    parser.add_argument(
        '--output', '-o',
        help='Output file path'
    )
    
    args = parser.parse_args()
    
    tool = CodeQualityChecker(
        args.target,
        verbose=args.verbose
    )
    
    results = tool.run()
    
    if args.json:
        output = json.dumps(results, indent=2)
        if args.output:
            with open(args.output, 'w') as f:
                f.write(output)
            print(f"Results written to {args.output}")
        else:
            print(output)

if __name__ == '__main__':
    main()
