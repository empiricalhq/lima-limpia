import marimo


__generated_with = "0.17.5"
app = marimo.App(width="medium")

with app.setup(hide_code=True):
    import geopandas as gpd
    import marimo as mo
    import matplotlib.pyplot as plt

    from utils.files import resolve_data_path


@app.cell(hide_code=True)
def _():
    mo.md(r"""
    # Visualizaciones geográficas de Perú

    Este notebook tiene algunos experimentos que hemos estado haciendo sobre los mapas departamentales, distritales y un mapa de calor de la población de Lima por manzana.

    **Autor**: Pedro Rojas, David Duran
    """)


@app.cell(hide_code=True)
def _():
    mo.md(r"""
    ## Mapa departamental de Perú
    """)


@app.cell
def _():
    mapa_departamental_path = resolve_data_path("geojson", "departamental.geojson")
    mapa_departamental_peru = gpd.read_file(mapa_departamental_path)
    return (mapa_departamental_peru,)


@app.cell
def _(mapa_departamental_peru):
    fig_dep, ax_dep = plt.subplots(1, 1, figsize=(8, 8))
    mapa_departamental_peru.plot(ax=ax_dep, edgecolor="gray", cmap="Pastel1")

    ax_dep.set_title("Mapa departamental del Perú")
    ax_dep.set_ylabel("Latitud")
    ax_dep.set_xlabel("Longitud")

    plt.tight_layout()
    mo.mpl.interactive(fig_dep)


@app.cell(hide_code=True)
def _():
    mo.md(r"""
    ## Mapa distrital de Perú
    """)


@app.cell
def _():
    mapa_distrital_path = resolve_data_path("geojson", "distrital.geojson")
    mapa_distrital = gpd.read_file(mapa_distrital_path)
    return (mapa_distrital,)


@app.cell
def _(mapa_distrital):
    fig_dist, ax_dist = plt.subplots(1, 1, figsize=(8, 8))

    mapa_distrital.plot(ax=ax_dist, edgecolor="gray", linewidth=0.2, cmap="Pastel2")

    ax_dist.set_title("Mapa distrital del Perú")
    ax_dist.set_ylabel("Latitud")
    ax_dist.set_xlabel("Longitud")

    plt.tight_layout()
    mo.mpl.interactive(fig_dist)


@app.cell(hide_code=True)
def _():
    mo.md(r"""
    ## Mapa de población por manzana en Lima

    Datos de [geogpsperu](https://drive.google.com/file/d/1qqVdEiCWofxUhPPgSHU0Le82FLUaA7-H/view).
    """)


@app.cell
def _():
    manzana_dbf_path = resolve_data_path("lima", "manzana.dbf")
    df_attrs = gpd.read_file(manzana_dbf_path)
    df_attrs = df_attrs.drop(columns="geometry", errors="ignore")
    df_attrs.columns = df_attrs.columns.str.strip()

    cols_to_drop = [
        "contacto",
        "whatsapp",
        "descargar",
        "ARCHIVO",
        "IDPROV",
        "NOMBDEP",
        "NOMBPROV",
        "AREA",
        "CODCCPP",
        "LLAVE_MZS",
    ]
    df_attrs = df_attrs.drop(columns=cols_to_drop, errors="ignore")
    return (df_attrs,)


@app.cell(hide_code=True)
def _():
    mo.md(r"""
    Then we load the shapefile and merge it with the attribute data (without this step, we wouldn't know the actual locations!)
    """)


@app.cell
def _(df_attrs):
    manzana_shp_path = resolve_data_path("lima", "manzana.shp")
    manzana_gdf = gpd.read_file(manzana_shp_path)
    manzana_gdf.columns = manzana_gdf.columns.str.strip()
    manzana_gdf = manzana_gdf.drop(columns=["T_TOTAL"], errors="ignore")

    manzana_merged_gdf = manzana_gdf.merge(
        df_attrs[["Mz", "T_TOTAL"]], on="Mz", how="left"
    )
    return (manzana_merged_gdf,)


@app.cell
def _(manzana_merged_gdf):
    fig, ax = plt.subplots(1, 1, figsize=(12, 12))
    manzana_merged_gdf.plot(
        column="T_TOTAL",
        ax=ax,
        legend=True,
        cmap="viridis",
        edgecolor="white",
        linewidth=0.3,
        missing_kwds={"color": "lightgrey"},
    )

    ax.set_title("Distribución de la población por manzana en Lima", fontsize=14)
    ax.set_axis_off()
    plt.tight_layout()

    mo.mpl.interactive(fig)


if __name__ == "__main__":
    app.run()
