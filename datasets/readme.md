# Datasets

This package contains Marimo notebooks for exploring public waste and population
data from Peru.

## Notebooks

| File                                                       | Contents                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| [`src/01-waste-generation.py`](src/01-waste-generation.py) | Annual municipal waste generation and a ranking of districts. |
| [`src/02-valorization.py`](src/02-valorization.py)         | Organic and inorganic waste valorization by district.         |
| [`src/03-population-map.py`](src/03-population-map.py)     | Department, district, and Lima block population maps.         |

The source pages are linked in the notebooks. They are published by the
[Peruvian open-data portal](https://datosabiertos.gob.pe/) and the
[National Environmental Information System](https://sinia.minam.gob.pe/portal/datos-abiertos/).
The main sources are
[annual waste generation](https://datosabiertos.gob.pe/dataset/generaci%C3%B3n-anual-de-residuos-s%C3%B3lidos-domiciliarios-y-municipales-ministerio-del-ambiente),
[municipal waste generation](https://datosabiertos.gob.pe/dataset/residuos-municipales-generados-anualmente),
and
[district waste valorization](https://datosabiertos.gob.pe/dataset/valorizaci%C3%B3n-de-residuos-s%C3%B3lidos-nivel-distrital-ministerio-del-ambiente-minam).

## Run a notebook

The project uses `mise` and `uv`. From this directory:

```sh
mise run install
uv run marimo edit src/01-waste-generation.py
```

Replace the notebook path to open another file. `mise run dev` opens Marimo
without choosing a file, and `mise run dev-lan` makes the server reachable on
the local network.

Downloaded CSV files are cached under `src/public/residuos` and are ignored by
Git. The tracked `manifest.json` records the source URL, title, and download
time. The population notebook reads the checked-in geographic files under
`src/public`.

## Export

The export task builds the population map notebook as a WebAssembly HTML bundle:

```sh
mise run export
```

The output is written to `src/output`, which is ignored by Git.

## Code quality

```sh
mise run fix
```

This runs Ruff's formatter and linter with fixes enabled.
