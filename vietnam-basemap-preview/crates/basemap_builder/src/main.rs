use basemap_builder::{build_package, load_config, BuildInputs};
use std::env;
use std::path::PathBuf;

fn main() {
    if let Err(error) = run() {
        eprintln!("basemap_builder: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args = Arguments::parse(env::args().skip(1))?;
    let config = load_config(&args.config).map_err(|error| error.to_string())?;
    let style_files = config
        .styles
        .iter()
        .map(|style| {
            let name = PathBuf::from(&style.path)
                .file_name()
                .ok_or_else(|| format!("style has no file name: {}", style.path))?
                .to_owned();
            Ok(args.styles_dir.join(name))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let inputs = BuildInputs {
        tile_archive: args.tile_archive,
        style_files,
        font_files: files_in(&args.fonts_dir)?,
        sprite_files: files_in(&args.sprites_dir)?,
        street_view_coverage: args.street_view_coverage,
    };
    let report =
        build_package(&config, &inputs, &args.output).map_err(|error| error.to_string())?;
    println!("created release: {}", report.release_dir.display());
    println!("manifest version: {}", report.manifest.version);
    Ok(())
}

fn files_in(directory: &PathBuf) -> Result<Vec<PathBuf>, String> {
    let mut files = std::fs::read_dir(directory)
        .map_err(|error| format!("cannot read {}: {error}", directory.display()))?
        .map(|entry| entry.map(|item| item.path()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    files.retain(|path| path.is_file());
    files.sort();
    Ok(files)
}

struct Arguments {
    config: PathBuf,
    tile_archive: PathBuf,
    styles_dir: PathBuf,
    fonts_dir: PathBuf,
    sprites_dir: PathBuf,
    street_view_coverage: Option<PathBuf>,
    output: PathBuf,
}

impl Arguments {
    fn parse<I>(args: I) -> Result<Self, String>
    where
        I: IntoIterator<Item = String>,
    {
        let mut values = std::collections::HashMap::new();
        let mut iterator = args.into_iter();
        while let Some(flag) = iterator.next() {
            let key = flag
                .strip_prefix("--")
                .ok_or_else(|| format!("unexpected argument: {flag}"))?;
            let value = iterator
                .next()
                .ok_or_else(|| format!("missing value for --{key}"))?;
            values.insert(key.to_owned(), PathBuf::from(value));
        }

        fn required(
            values: &mut std::collections::HashMap<String, PathBuf>,
            key: &str,
        ) -> Result<PathBuf, String> {
            values
                .remove(key)
                .ok_or_else(|| format!("missing required argument --{key}"))
        }

        let result = Self {
            config: required(&mut values, "config")?,
            tile_archive: required(&mut values, "tile-archive")?,
            styles_dir: required(&mut values, "styles-dir")?,
            fonts_dir: required(&mut values, "fonts-dir")?,
            sprites_dir: required(&mut values, "sprites-dir")?,
            street_view_coverage: values.remove("street-view-coverage"),
            output: required(&mut values, "output")?,
        };
        if let Some((unknown, _)) = values.into_iter().next() {
            return Err(format!("unknown argument --{unknown}"));
        }
        Ok(result)
    }
}
