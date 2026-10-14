import marimo


__generated_with = "0.17.5"
app = marimo.App(width="medium")

with app.setup(hide_code=True):
    import logging

    import marimo as mo
    import plotly.express as px
    import polars as pl

    import utils.datasets

    from utils.files import resolve_data_path

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
    )


@app.cell(hide_code=True)
def _():
    mo.md(r"""
    # Análisis de valorización de residuos sólidos orgánicos e inorgánicos

    **Idea original**: Andrés Cosme

    **Re-implementación**: David Duran
    """)


@app.cell(hide_code=True)
def _():
    mo.md("""
    ## Descarga de datasets de valorización
    """)


@app.cell
def _():
    DATA_DIR = resolve_data_path("residuos")
    return (DATA_DIR,)


@app.cell
def _(DATA_DIR):
    valorization_URL = "https://datosabiertos.gob.pe/dataset/valorizaci%C3%B3n-de-residuos-s%C3%B3lidos-nivel-distrital-ministerio-del-ambiente-minam"
    downloaded_files = utils.datasets.download(valorization_URL, DATA_DIR)
    return (downloaded_files,)


@app.cell
def _(downloaded_files):
    valorization_org_path = next(f for f in downloaded_files if "org" in f.name.lower())

    valorization_inorg_path = next(
        f for f in downloaded_files if "inorg" in f.name.lower()
    )

    output = f"- Orgánico: `{valorization_org_path.name}`\n- Inorgánico: `{valorization_inorg_path.name}`"
    mo.md(output)
    return valorization_inorg_path, valorization_org_path


@app.cell(hide_code=True)
def _():
    mo.md("""
    ## Carga y limpieza de datos
    """)


@app.cell
def _(valorization_inorg_path, valorization_org_path):
    valorization_org_raw = pl.read_csv(
        valorization_org_path,
        separator=";",
        encoding="latin1",
        infer_schema_length=0,
    )

    valorization_inorg_raw = pl.read_csv(
        valorization_inorg_path,
        separator=";",
        encoding="latin1",
        infer_schema_length=0,
    )
    mo.md(
        f"- Orgánicos: {valorization_org_raw.shape[0]:,} filas cargadas.\n"
        f"- Inorgánicos: {valorization_inorg_raw.shape[0]:,} filas cargadas."
    )
    return valorization_inorg_raw, valorization_org_raw


@app.function(hide_code=True)
def normalize_cols(df):
    """Normalize column names to uppercase, without accents or spaces."""

    def clean(col):
        return (
            col.replace("ï»¿", "")
            .replace("Ï»¿", "")
            .strip()
            .upper()
            .replace(" ", "_")
            .replace("Á", "A")
            .replace("É", "E")
            .replace("Í", "I")
            .replace("Ó", "O")
            .replace("Ú", "U")
        )

    return df.rename({c: clean(c) for c in df.columns})


@app.cell
def _(valorization_org_raw):
    valorization_org = normalize_cols(valorization_org_raw)
    valorization_org.head()


@app.cell
def _(valorization_inorg_raw):
    valorization_inorg = normalize_cols(valorization_inorg_raw)
    valorization_inorg.head()
    return (valorization_inorg,)


@app.cell(hide_code=True)
def _():
    mo.md("""
    ## Procesamiento y agregación
    """)


@app.function(hide_code=True)
def process_df(df, col_name, new_col_name):
    return (
        df.with_columns(
            pl.col(col_name)
            .cast(str)
            .str.replace_all(r"[^\d.]", "")
            .cast(pl.Float64, strict=False)
            .fill_null(0.0)
            .alias(new_col_name)
        )
        .group_by(["DEPARTAMENTO", "PROVINCIA", "DISTRITO"])
        .agg(pl.col(new_col_name).sum())
    )


@app.cell
def _(valorization_inorg):
    valorization_inorg_agg = process_df(
        valorization_inorg, "QRESIDUOS__VAL_INORGAN", "INORG_TON"
    )

    valorization_org_agg = (
        valorization_inorg.with_columns(pl.lit(0.0).alias("ORG_TON"))
        .group_by(["DEPARTAMENTO", "PROVINCIA", "DISTRITO"])
        .agg(pl.col("ORG_TON").sum())
    )
    return valorization_inorg_agg, valorization_org_agg


@app.cell
def _(valorization_inorg_agg, valorization_org_agg):
    valorization_total = valorization_org_agg.join(
        valorization_inorg_agg,
        on=["DEPARTAMENTO", "PROVINCIA", "DISTRITO"],
        how="full",
    ).with_columns([pl.all().fill_null(0.0)])

    valorization_total = valorization_total.with_columns(
        (pl.col("ORG_TON") + pl.col("INORG_TON")).alias("TOTAL_TON")
    )
    return (valorization_total,)


@app.cell(hide_code=True)
def _():
    mo.md("""
    ## Visualización: Top 10 distritos por valorización total
    """)


@app.cell
def _(valorization_total):
    top10 = (
        valorization_total.sort("TOTAL_TON", descending=True)
        .head(10)
        .with_columns(
            pl.concat_str(
                [
                    pl.col("DISTRITO"),
                    pl.lit(" ("),
                    pl.col("PROVINCIA"),
                    pl.lit(")"),
                ]
            ).alias("ETIQUETA")
        )
    )

    fig = px.bar(
        top10.to_pandas(),
        x="ETIQUETA",
        y=["ORG_TON", "INORG_TON"],
        barmode="stack",
        text_auto=True,
        title="Top 10 distritos por toneladas totales valorizadas",
        labels={"value": "Toneladas", "variable": "Tipo de residuo"},
    )

    fig.update_layout(xaxis_title="Distrito", yaxis_title="Toneladas valorizadas")
    mo.ui.plotly(fig)


if __name__ == "__main__":
    app.run()
