# Release Workflow

The release manager keeps version directories immutable and stores only the
currently active release in active.json.

1. Build a candidate package with basemap_builder.
2. Run the validate command for the version and inspect the structured report.
3. Manually approve the candidate and run the activate command for the version.
4. If a published candidate is later rejected, run the rollback command for an
   older immutable release.

Candidate validation checks the shared manifest, every declared style, and all
declared package assets. A failed candidate never replaces the active pointer.
