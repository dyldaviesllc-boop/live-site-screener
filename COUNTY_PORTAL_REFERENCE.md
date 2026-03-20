# County Assessor, GIS & Zoning Portal Reference

Research compiled: March 2026

---

## Table of Contents
1. [Los Angeles, CA — Los Angeles County](#1-los-angeles-ca--los-angeles-county)
2. [Dallas-Fort Worth, TX — Dallas County / Tarrant County](#2-dallas-fort-worth-tx--dallas-county--tarrant-county)
3. [Seattle, WA — King County](#3-seattle-wa--king-county)
4. [San Diego, CA — San Diego County](#4-san-diego-ca--san-diego-county)
5. [Phoenix, AZ — Maricopa County](#5-phoenix-az--maricopa-county)
6. [Denver, CO — Denver County](#6-denver-co--denver-county)
7. [Chicago, IL — Cook County](#7-chicago-il--cook-county)
8. [New York, NY — NYC (Multi-borough)](#8-new-york-ny--nyc-multi-borough)
9. [Houston, TX — Harris County](#9-houston-tx--harris-county)
10. [Atlanta, GA — Fulton County](#10-atlanta-ga--fulton-county)
11. [Nashville, TN — Davidson County](#11-nashville-tn--davidson-county)
12. [Charlotte, NC — Mecklenburg County](#12-charlotte-nc--mecklenburg-county)
13. [Orlando, FL — Orange County](#13-orlando-fl--orange-county)
14. [Tampa, FL — Hillsborough County](#14-tampa-fl--hillsborough-county)
15. [Austin, TX — Travis County](#15-austin-tx--travis-county)
16. [Aggregator Sites & Open Data Projects](#16-aggregator-sites--open-data-projects)
17. [Summary: API Availability Matrix](#17-summary-api-availability-matrix)

---

## 1. Los Angeles, CA — Los Angeles County

### County Assessor / Property Search
- **URL**: https://portal.assessor.lacounty.gov/mapsearch
- **Alt**: https://assessor.lacounty.gov/homeowners/property-search
- **Data**: Lot size, building SF, year built, assessed values, ownership
- **Format**: HTML portal (no public API on assessor portal itself)

### GIS / Parcel Viewer
- **Enterprise GIS Hub**: https://egis-lacounty.hub.arcgis.com/
- **ArcGIS REST Root**: https://public.gis.lacounty.gov/public/rest/services
- **Assessor REST Root**: https://arcgis.gis.lacounty.gov/arcgis/rest/services (has Assessor folder)
- **Parcel Map Service (ArcGIS Hub)**: https://hub.arcgis.com/datasets/lacounty::la-county-parcel-map-service
- **API?**: YES — full ArcGIS REST API returning JSON/GeoJSON
- **Data format**: JSON, GeoJSON via ArcGIS REST query endpoints

### Zoning Map / Lookup
- **ZIMAS (City of LA)**: https://zimas.lacity.org/
  - Search by address, APN, intersection, case number
  - Returns zoning designation, overlays, specific plans, historic districts
  - HTML only — no public API
- **LA County (unincorporated)**: https://rpgis.isd.lacounty.gov/Html5Viewer/index.html?viewer=GISNET_Public.GIS-NET_Public
  - Planning Department's GIS-NET viewer

### Municipal Code
- **City of LA Zoning Code**: https://planning.lacity.gov/zoning/local-zoning-rules
  - Chapter 1 (Original Code, 1946) and Chapter 1A (New Zoning Code, 2025+)
- **LA County Code**: https://library.municode.com/ca/los_angeles_county

### Notes
- ZIMAS is the gold standard for LA zoning lookups but is HTML-only (scraping required).
- The ArcGIS REST parcel services return structured JSON and are the best path for automation.
- LA County is massive — city vs. unincorporated areas use different zoning systems.

---

## 2. Dallas-Fort Worth, TX — Dallas County / Tarrant County

### Dallas County — Assessor / Property Search
- **DCAD Portal**: https://www.dallascad.org/searchaddr.aspx
- **Data**: Owner, legal description, acreage, building SF, year built, assessed values
- **Format**: HTML portal

### Dallas County — GIS / Parcel Viewer
- **DCAD Property Map**: https://maps.dcad.org/prd/dpm/
- **ArcGIS REST**: https://maps.dcad.org/prdwa/rest/services/
- **Dallas County Open Data Hub**: https://dallas-county-open-data-hub-dallascountygis.hub.arcgis.com/
- **GIS Data Downloads (shapefiles)**: https://www.dallascad.org/gisdataproducts.aspx
- **API?**: YES — ArcGIS REST services available; also shapefile downloads
- **Data format**: JSON via REST; Shapefile downloads

### Tarrant County — Assessor / Property Search
- **TAD Portal**: https://www.tad.org/search-results
- **Note**: TAD is transitioning to "True Prodigy" system; old search retiring 2027
- **Open Data Portal**: https://gis-tad.opendata.arcgis.com/
- **API?**: YES — ArcGIS Open Data portal with REST endpoints
- **Data format**: JSON, GeoJSON, CSV, Shapefile via ArcGIS Hub

### Zoning Map / Lookup
- **City of Dallas**: https://developmentweb.dallascityhall.com/publiczoningweb/
- **City of Fort Worth**: https://www.fortworthtexas.gov/departments/development-services/zoning

### Municipal Code
- **Dallas Code of Ordinances**: https://codelibrary.amlegal.com/codes/dallas/latest/overview
- **Fort Worth Zoning Ordinance**: https://www.fortworthtexas.gov/departments/development-services/zoning/ordinance (via American Legal Publishing)

### Notes
- DFW requires checking two separate county appraisal districts.
- Tarrant County's open data ArcGIS hub is well-structured for API access.
- Dallas has shapefile downloads in addition to REST services.

---

## 3. Seattle, WA — King County

### County Assessor / Property Search
- **eReal Property**: https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx
- **Property Lookup**: https://kingcounty.gov/en/dept/assessor/buildings-and-property/property-value-and-information/look-up-property-information
- **Data**: Owner, lot size, building SF, year built, assessed values, sales history
- **Format**: HTML portal + Open Data downloads

### GIS / Parcel Viewer
- **Parcel Viewer**: https://gismaps.kingcounty.gov/parcelviewer2/
- **GIS Open Data (ArcGIS Hub)**: https://gis-kingcounty.opendata.arcgis.com/
- **King County Open Data (Socrata)**: https://data.kingcounty.gov/
  - eReal Property dataset: https://data.kingcounty.gov/Property-Assessments/eReal-Property-Search/4zym-vfd2
- **Assessor Data Download (bulk CSV)**: https://info.kingcounty.gov/assessor/datadownload/default.aspx
- **API?**: YES — Socrata SODA API on data.kingcounty.gov; ArcGIS Hub for spatial data
- **Data format**: JSON via Socrata API; GeoJSON/Shapefile via ArcGIS Hub; bulk CSV downloads

### Zoning Map / Lookup
- **Seattle SDCI Zoning**: https://www.seattle.gov/sdci/codes/codes-we-enforce-(a-z)/zoning
  - Official zoning maps as PDFs + web app
- **King County Parcel Viewer** also shows zoning for unincorporated areas

### Municipal Code
- **Seattle Municipal Code (Title 23 — Land Use)**: https://library.municode.com/wa/seattle/codes/municipal_code
- **King County Code**: https://kingcounty.gov/en/legacy/council/legislation/kc_code.aspx

### Notes
- King County is one of the best for data access: Socrata API, ArcGIS Hub, AND bulk CSV downloads.
- The Socrata API returns JSON and supports SQL-like queries (SoQL).
- Bulk assessor data downloads include real property, building info, sales — excellent for batch processing.

---

## 4. San Diego, CA — San Diego County

### County Assessor / Property Search
- **ParcelQuest (Assessor portal)**: https://www.sdarcc.gov/content/arcc/home/divisions/assessor/parcel-quest-disclaimer.html
  - 25 free searches per 30-day period
- **Format**: HTML portal

### GIS / Parcel Viewer
- **SANDAG Parcel Lookup**: https://sdgis.sandag.org/
- **SanGIS (data provider)**: https://www.sangis.org/
- **SanGIS Interactive Map**: https://www.sangis.org/pages/interactive-map
- **County GIS Portal**: https://gis-portal.sandiegocounty.gov/
- **API?**: PARTIAL — SanGIS provides downloadable data; SANDAG has a web viewer
- **Data format**: Shapefile downloads from SanGIS; HTML viewers

### Zoning Map / Lookup
- **ZAPP (City of San Diego)**: https://sandiego.maps.arcgis.com/apps/instant/sidebar/index.html?appid=75f6a5d68aee481f8ff48240bcaa1239
  - ArcGIS-based — may have queryable REST endpoint behind it
- **County Zoning & Property Info**: https://gis-portal.sandiegocounty.gov/arcgis/home/webmap/viewer.html?webmap=f1b69ba9d3dd4940b8d1efcc9dac2ac4

### Municipal Code
- **City of San Diego Municipal Code (Ch 10-15 for zoning)**: https://www.sandiego.gov/city-clerk/officialdocs/municipal-code

### Notes
- ParcelQuest has a 25-search limit per month — not great for bulk lookups.
- SanGIS is the main spatial data provider; data is downloadable but may require a data-sharing agreement for some datasets.
- ZAPP is ArcGIS-based, so there may be queryable REST services behind it.

---

## 5. Phoenix, AZ — Maricopa County

### County Assessor / Property Search
- **Parcel Viewer**: https://maps.mcassessor.maricopa.gov/
- **Data**: Owner, lot size, acreage, building SF, year built, assessed values
- **Format**: ArcGIS web app with REST backend

### GIS / Parcel Viewer
- **ArcGIS REST — Parcels MapServer**: https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer
- **Dynamic Query Service**: https://gis.mcassessor.maricopa.gov/arcgis/rest/services/MaricopaDynamicQueryService/MapServer
- **REST Services Root**: https://gis.mcassessor.maricopa.gov/arcgis/rest/services
- **GIS Open Data (ArcGIS Hub)**: https://data-maricopa.opendata.arcgis.com/
- **API?**: YES — full ArcGIS REST API with JSON/GeoJSON responses
- **Data format**: JSON, GeoJSON via REST queries; downloads via Open Data Hub

### Zoning Map / Lookup
- **City of Phoenix Zoning Maps**: https://www.phoenix.gov/administration/departments/pdd/tools-resources/maps/zoning-maps.html
- **Maricopa County PlanNet (unincorporated)**: https://gis.maricopa.gov/pnd/PlanNet/index.html

### Municipal Code
- **Maricopa County Zoning Ordinance**: https://www.maricopa.gov/2271/Ordinances-Regulations-and-Codes
- **City of Phoenix Zoning Code**: via Municode or city website

### Notes
- Maricopa County has EXCELLENT ArcGIS REST API support. Parcels MapServer returns JSON/GeoJSON with fields like APN, owner, acreage, land use.
- The Dynamic Query Service combines parcels, subdivisions, and personal properties.
- Open Data Hub updated daily for many datasets. This is one of the best counties for API-driven data access.

---

## 6. Denver, CO — Denver County

### County Assessor / Property Search
- **Property Search**: https://www.denvergov.org/Property
- **Data**: Owner, lot size, building SF, year built, assessed values
- **Format**: HTML portal

### GIS / Parcel Viewer
- **Assessor Maps**: https://www.denvergov.org/Maps/map/assessormaps
- **Denver Open Data Catalog (ArcGIS)**: https://www.arcgis.com/home/group.html?id=31a0c1babcc84c80b4ebcff5fecb159b
- **Denver Parcels dataset**: https://www.arcgis.com/home/item.html?id=221199b5a12142f896d6503a19bb96a2
- **API?**: PARTIAL — ArcGIS-hosted datasets available; Open Data Catalog
- **Data format**: Shapefile, GeoJSON downloads; potential REST query on ArcGIS items

### Zoning Map / Lookup
- **Denver Zoning Map**: https://www.denvergov.org/maps/map/zoning
- **Denver Zoning dataset (ArcGIS Hub)**: https://hub.arcgis.com/datasets/7410ea2dcce84e348ff9d64c4025eae1

### Municipal Code
- **Denver Zoning Code**: https://denvergov.org/Government/Agencies-Departments-Offices/Community-Planning-and-Development/Denver-Zoning-Code
- **Denver Code of Ordinances (Ch 59 Zoning)**: https://library.municode.com/co/denver/codes/code_of_ordinances?nodeId=TITIIREMUCO_CH59ZO

### Notes
- Denver is a consolidated city-county, simplifying lookups.
- Zoning map and parcels are on ArcGIS, suggesting REST API availability behind the viewers.
- Open Data Catalog has downloadable datasets.

---

## 7. Chicago, IL — Cook County

### County Assessor / Property Search
- **Cook County Assessor**: https://www.cookcountyassessor.com/
- **CookViewer (combined property info)**: https://maps.cookcountyil.gov/cookviewer/
- **Data**: PIN-based lookup; owner, lot size, building SF, year built, assessed values, appeal history
- **Format**: HTML portal + Open Data API

### GIS / Parcel Viewer
- **CookViewer**: https://maps.cookcountyil.gov/cookviewer/mapViewer.html
- **Tax Map Viewer**: https://maps.cookcountyil.gov/taxmapviewer/
- **Cook Central (ArcGIS Hub)**: https://hub-cookcountyil.opendata.arcgis.com/
- **Cook County Open Data (Socrata)**: https://datacatalog.cookcountyil.gov/
  - Assessor Parcel Universe: https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Parcel-Universe/nj4t-kc8j
  - Assessed Values: https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Assessed-Values/uzyt-m557
  - Parcel Sales: https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Parcel-Sales/wvhk-k5uv
- **GitHub (CCAO data tools)**: https://github.com/ccao-data
- **API?**: YES — Socrata SODA API on all open data datasets; ArcGIS Hub for spatial
- **Data format**: JSON via Socrata API; GeoJSON/Shapefile via ArcGIS Hub; CSV exports

### Zoning Map / Lookup
- **Chicago Zoning Map**: announced via city portal; also available on Chicago Data Portal
- **2nd City Zoning (community tool)**: https://secondcityzoning.org/
- **Chicago Data Portal — Zoning Districts**: https://data.cityofchicago.org/d/7cve-jgbp
- **Cook County (unincorporated)**: https://secure.cookcountyil.gov/BZ/zoning_info

### Municipal Code
- **Chicago Zoning Ordinance (Title 17)**: https://codelibrary.amlegal.com/codes/chicago/latest/chicagozoning_il/0-0-0-48750
- **Cook County Code of Ordinances**: https://library.municode.com/il/cook_county/codes/code_of_ordinances

### Notes
- Cook County is EXCELLENT for data access. Socrata API with SODA endpoints on multiple assessment datasets.
- CCAO publishes code on GitHub — very transparency-forward.
- 20+ years of historic assessment data available via open data.
- Chicago zoning data is also on the Chicago Data Portal (Socrata) — queryable via API.

---

## 8. New York, NY — NYC (Multi-borough)

### Property Search / Assessor
- **NYC Property Information Portal**: https://propertyinformationportal.nyc.gov/
- **ACRIS (deed/mortgage records)**: https://a836-acris.nyc.gov/
- **NYC Finance Property Tax**: https://www.nyc.gov/site/finance/taxes/property.page
- **Data**: Owner, lot dimensions, building class, year built, assessed values, zoning, FAR
- **Format**: HTML portal + PLUTO bulk data + Socrata API

### GIS / Parcel Viewer — PLUTO & MapPLUTO
- **PLUTO on NYC Open Data**: https://data.cityofnewyork.us/City-Government/Primary-Land-Use-Tax-Lot-Output-PLUTO-/64uk-42ks
- **MapPLUTO (with geometry)**: https://hub.arcgis.com/datasets/DCP::mappluto-1/about
- **PLUTO documentation**: https://nycplanning.github.io/db-pluto/
- **NYC Open Data Portal**: https://opendata.cityofnewyork.us/
- **ACRIS datasets on Open Data**: https://data.cityofnewyork.us/City-Government/ACRIS-Real-Property-Master/bnx9-e6tj
- **API?**: YES — Socrata SODA API on all NYC Open Data datasets
- **Data format**: JSON, GeoJSON, CSV, Shapefile — PLUTO has 80+ attributes per tax lot

### Zoning Map / Lookup
- **ZoLa (Zoning & Land Use Map)**: https://zola.planning.nyc.gov/
  - Search by address, BBL, block/lot
  - Shows zoning district, overlays, special districts, land use, FAR
  - HTML viewer — no direct public API (but data is in PLUTO)

### Municipal Code / Zoning Resolution
- **NYC Zoning Resolution**: https://zoningresolution.planning.nyc.gov/
  - 14 Articles + 11 Appendices + 126 Zoning Maps
- **Zoning Map Index (PDFs)**: https://www.nyc.gov/site/planning/zoning/index-map.page

### Notes
- NYC is the BEST market for open data. PLUTO/MapPLUTO contains ~870,000 tax lots with 80+ attributes including zoning, FAR, building class, lot area, building area, year built, etc.
- Socrata SODA API supports SQL-like queries (SoQL) — you can query by address, BBL, zoning district, etc.
- MapPLUTO available as GeoJSON and Shapefile — can be loaded directly into mapping applications.
- ZoLa is HTML-only but PLUTO data covers the same information programmatically.
- ACRIS data (deeds, mortgages) also on Socrata API.

---

## 9. Houston, TX — Harris County

### County Assessor / Property Search
- **HCAD Property Search**: https://hcad.org/property-search/property-search
- **Data**: Owner, lot size, acreage, building SF, year built, assessed values
- **Format**: HTML portal

### GIS / Parcel Viewer
- **HCAD Parcel Viewer v2.0**: https://arcweb.hcad.org/parcel-viewer-v2.0/
- **ArcGIS REST — HCAD Parcels MapServer**: https://www.gis.hctx.net/arcgis/rest/services/HCAD/Parcels/MapServer
  - Layer 0 (HCAD Parcels): https://www.gis.hctx.net/arcgis/rest/services/HCAD/Parcels/MapServer/0
  - Query endpoint: `.../MapServer/0/query`
  - Fields: HCAD_NUM, Acreage, StatedArea, owner_name, parcel_type, tax_year
  - Supports JSON and GeoJSON query formats; MaxRecordCount: 1000
- **Harris County Open Data**: https://geo-harriscounty.opendata.arcgis.com/
- **PDATA (bulk data)**: https://hcad.org/hcad-online-services/pdata/
- **GIS Downloads (shapefiles, quarterly)**: https://hcad.org/pdata/pdata-gis-downloads.html
- **API?**: YES — ArcGIS REST API with JSON/GeoJSON; also bulk shapefile downloads
- **Data format**: JSON, GeoJSON via REST; ESRI Shapefile downloads; bulk CSV via PDATA

### Zoning Map / Lookup
- **HOUSTON HAS NO ZONING.** This is unique among major US cities.
- Development is governed by subdivision ordinances, deed restrictions, and building codes.
- **City of Houston Development Regulations**: https://www.houstontx.gov/planning/DevelopRegs/
- Relevant regulations: setbacks, parking, lot size, density, buffering — applied through subdivision process

### Municipal Code
- **Houston Code of Ordinances**: https://library.municode.com/tx/houston/codes/code_of_ordinances
- Focus on Chapter 42 (Subdivisions) for lot size / density controls

### Notes
- Harris County HCAD has a well-documented ArcGIS REST API. The parcels endpoint returns structured JSON with owner, acreage, and account number.
- PDATA provides bulk certified/preliminary values + GIS shapefiles — updated quarterly.
- No zoning simplifies some analysis but complicates others — you need to check deed restrictions, which are private and not easily searchable.

---

## 10. Atlanta, GA — Fulton County

### County Assessor / Property Search
- **qPublic (Fulton County)**: https://qpublic.schneidercorp.com/Application.aspx?App=FultonCountyGA&Layer=Parcels&PageType=Search
- **Fulton County Board of Assessors**: https://fultonassessor.org/
- **Assessor GIS**: https://iaspublicaccess.fultoncountyga.gov/maps/mapadv.aspx
- **Data**: Owner, lot size, building SF, year built, assessed values
- **Format**: HTML portal (qPublic is a common vendor platform)

### GIS / Parcel Viewer
- **Property Map Viewer**: https://gis.fultoncountyga.gov/Apps/PropertyMapViewer/
- **Open Data (ArcGIS Hub)**: https://gisdata.fultoncountyga.gov/
- **Parcels dataset**: https://fultoncountyopendata-fulcogis.opendata.arcgis.com/datasets/ccf7aa525143406da6e36f79e989b263
- **API?**: YES — ArcGIS Open Data Hub with feature service endpoints
- **Data format**: JSON, GeoJSON, CSV, Shapefile via ArcGIS Hub

### Zoning Map / Lookup
- **City of Atlanta Official Zoning Map**: https://gis.atlantaga.gov/zoningmap/
- **Atlanta GIS Interactive Maps**: https://gis.atlantaga.gov/interactivemaps-2-col.html

### Municipal Code
- **Atlanta Zoning Code (Part 16)**: http://atlanta.elaws.us/code/coor_ptiii_pt16
- **Fulton County Code**: https://library.municode.com/ga/fulton_county

### Notes
- qPublic (Schneider Corp) is the assessor search vendor — used by many GA counties; HTML-based.
- Fulton County's ArcGIS Open Data Hub has parcels available as feature services with REST API access.
- City of Atlanta has its own GIS zoning map — separate from county.

---

## 11. Nashville, TN — Davidson County

### County Assessor / Property Search
- **Property Assessor**: https://www.padctn.org/real-property-search/
- **Data**: Owner, lot size, building SF, year built, assessed values
- **Format**: HTML portal

### GIS / Parcel Viewer
- **Nashville Parcel Viewer**: https://maps.nashville.gov/ParcelViewer/
  - Shows ownership, zoning, permits, and many overlay layers
- **ArcGIS REST — Cadastral/Parcels MapServer**: https://maps.nashville.gov/arcgis/rest/services/Cadastral/Parcels/MapServer
- **Cadastral Layers (JSON/GeoJSON, MaxRecords: 4000)**: https://maps.nashville.gov/arcgis/rest/services/Cadastral/Cadastral_Layers/MapServer
- **Nashville Open Data (ArcGIS Hub)**: https://datanashvillegov-nashville.hub.arcgis.com/
- **API?**: YES — ArcGIS REST API with JSON/GeoJSON; Open Data Hub
- **Data format**: JSON, GeoJSON via REST; downloads via Hub

### Zoning Map / Lookup
- **Nashville Parcel Viewer** includes zoning layers
- **Nashville Open Data** has boundary datasets

### Municipal Code
- **Metro Nashville Zoning Code (Title 17)**: https://library.municode.com/tn/metro_government_of_nashville_and_davidson_county/codes/code_of_ordinances?nodeId=CD_TIT17ZO
- **Understanding the Zoning Code**: https://www.nashville.gov/departments/codes/construction-and-permits/land-use-and-zoning-information/understanding-zoning-code

### Notes
- Nashville is a consolidated city-county (Metro Government), simplifying lookups.
- ArcGIS REST services are well-exposed with JSON/GeoJSON support and 4000 max record count.
- Nashville Parcel Viewer is feature-rich — includes zoning, permits, ownership all in one tool.

---

## 12. Charlotte, NC — Mecklenburg County

### County Assessor / Property Search
- **POLARIS 3G**: https://polaris3g.mecklenburgcountync.gov
  - Property Ownership Land Records Information System
  - 80+ mapping overlays; property info, assessed values, sales
- **Data**: Owner, lot size, building SF, year built, assessed values, sales
- **Format**: ArcGIS web app

### GIS / Parcel Viewer
- **Mecklenburg County GIS**: https://gis.mecknc.gov/
- **GeoPortal**: https://mcmap.org/geoportal/
  - Free, open-source tool for community data discovery
- **Open Mapping (ArcGIS Hub)**: https://mecklenburg-county-gis-open-mapping-meckgov.hub.arcgis.com/
  - POLARIS dataset: https://mecklenburg-county-gis-open-mapping-meckgov.hub.arcgis.com/datasets/polaris-3g-1
- **ArcGIS REST Services**: confirmed via MapServer endpoints (e.g., basemap_aerial)
- **Data Center downloads**: https://gis.mecknc.gov/data-center
- **Charlotte Open Data — Parcel Look Up**: https://data.charlottenc.gov/datasets/charlotte::parcel-look-up/about
- **API?**: YES — ArcGIS REST services; Open Mapping Hub; open-source GeoPortal
- **Data format**: JSON, GeoJSON, CSV, Shapefile via Hub; REST API

### Zoning Map / Lookup
- **Charlotte Parcel Zoning Lookup (Open Data)**: https://data.charlottenc.gov/datasets/charlotte::parcel-zoning-lookup/about
- **Charlotte Zoning Page**: https://www.charlottenc.gov/Growth-and-Development/Planning-and-Development/Zoning
- **Charlotte UDO (Unified Development Ordinance)**: https://charlotteudo.org/

### Municipal Code
- **Charlotte Code of Ordinances (Appendix A — Zoning)**: https://library.municode.com/nc/charlotte/codes/code_of_ordinances?nodeId=PTIICOOR_APXAZO
- **Charlotte UDO Zoning Translation**: https://charlotteudo.org/zoning-translation/

### Notes
- Mecklenburg County is a leader in open GIS data. GeoPortal is open-source.
- POLARIS 3G is a comprehensive property tool built on ArcGIS.
- Charlotte has a dedicated "Parcel Zoning Lookup" on their open data portal — very useful.
- The open data and REST services make this one of the better counties for automation.

---

## 13. Orlando, FL — Orange County

### County Assessor / Property Search
- **Orange County Property Appraiser**: https://ocpaweb.ocpafl.org/
- **Parcel Viewer**: 450,000+ parcels searchable by owner, address, or parcel ID
- **Data**: Owner, lot size, building SF, year built, just value, deed history
- **Format**: HTML portal + GIS viewer

### GIS / Parcel Viewer
- **OCGIS Data Hub (ArcGIS Hub)**: https://ocgis-datahub-ocfl.hub.arcgis.com/
  - API links for GeoServices, WMS, WFS
- **ArcGIS REST — Public Dynamic MapServer**: https://ocgis4.ocfl.net/arcgis/rest/services/Public_Dynamic/MapServer
- **OC Land Insights**: https://webapps.ocgis.com/oclandinsights/home/
- **InfoMap Public**: https://ocgis4.ocfl.net/Html5Viewer/Index.html?viewer=InfoMap_Public_HTML5.InfoMap_Public
- **API?**: YES — ArcGIS REST services; OCGIS Data Hub with GeoServices/WMS/WFS
- **Data format**: JSON via REST; GeoJSON, CSV, Shapefile via Hub

### Zoning Map / Lookup
- **City of Orlando Zoning Maps**: https://www.orlando.gov/Our-Government/Records-and-Documents/Map-Library/Zoning-Maps
- **Find Your Zoning (City of Orlando)**: https://www.orlando.gov/Building-Development/Planning-Zoning-Approvals/Find-Your-Propertys-Zoning-Category
- **Orange County Zoning Division**: https://www.orangecountyfl.net/PermitsLicenses/ZoningDivision.aspx

### Municipal Code
- **Orange County Code**: https://library.municode.com/fl/orange_county/codes/code_of_ordinances
- **City of Orlando Code**: https://library.municode.com/fl/orlando

### Notes
- OCGIS Data Hub provides proper API access (GeoServices, WMS, WFS) — good for automation.
- The Property Appraiser's web portal is HTML-based but the GIS services behind it are ArcGIS REST.
- City of Orlando vs. unincorporated Orange County have separate zoning authorities.

---

## 14. Tampa, FL — Hillsborough County

### County Assessor / Property Search
- **Hillsborough County Property Appraiser**: https://www.hcpafl.org/
- **Property Search**: https://gis.hcpafl.org/propertysearch/
- **GIS Search**: https://gis.hcpafl.org/gissearch/
- **Data**: Owner, lot size, building SF, year built, just value, land use codes
- **Format**: HTML portal + GIS viewer

### GIS / Parcel Viewer
- **Hillsborough County GeoHub (ArcGIS)**: https://gis2017-01-10t133755357z-hillsborough.opendata.arcgis.com/
- **ArcGIS REST — Parcels FeatureServer (Tampa)**: https://arcgis.tampagov.net/arcgis/rest/services/Parcels/
- **Maps & Data Downloads**: https://www.hcpafl.org/Downloads/Maps-Data
- **Plan Hillsborough GIS Data**: https://planhillsborough.org/gis-maps-data-files/
- **API?**: YES — ArcGIS REST FeatureServer; GeoHub with open data
- **Data format**: JSON via REST (MaxRecordCount: 2000); downloads available

### Zoning Map / Lookup
- **City of Tampa Zoning Maps**: https://www.tampa.gov/development-coordination/zoning/maps
- **Hillsborough County Map Viewer**: https://hcfl.gov/businesses/zoning/hillsborough-county-map-viewer
- **PIMA (Planning Information Map App)**: https://gis.tpcmaps.org/apps/Production/pima/

### Municipal Code
- **City of Tampa Zoning (Chapter 27)**: https://www.tampa.gov/sites/default/files/content/files/migrated/chapter_27-289.56supp_81_ch27_9_10_13.pdf
- **Hillsborough County Land Development Code**: https://library.municode.com/fl/hillsborough_county/codes/land_development_code

### Notes
- HCPAFL provides free property search and GIS tools — no paywall.
- ArcGIS REST services available through Tampa's GIS infrastructure.
- PIMA (Plan Hillsborough) is useful for planning/zoning research.
- Data updated daily on the ArcGIS feature server.

---

## 15. Austin, TX — Travis County

### County Assessor / Property Search
- **Travis CAD Property Search**: https://traviscad.org/propertysearch/
- **Austin CAD Search**: https://esearch.austincad.org/
- **Interactive Map**: https://travis.prodigycad.com/maps
- **Data**: Owner, lot size, acreage, building SF, year built, assessed values
- **Format**: HTML portal + interactive map

### GIS / Parcel Viewer
- **Travis County TNR GeoHub (ArcGIS)**: https://tnr-traviscountytx.opendata.arcgis.com/
- **ArcGIS REST — TCAD Parcels**: https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/TCAD_Travis_County_Property/MapServer
- **TCAD Parcels Layer 0**: https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/TCAD_public/MapServer/0
- **Parcels MapServer**: https://taxmaps.traviscountytx.gov/arcgis/rest/services/Parcels/MapServer
  - Supports JSON/GeoJSON; MaxRecordCount: 2000
- **Travis County Open Data Portal**: https://www.traviscountytx.gov/open-data-portal
- **City of Austin GIS Data**: https://www.austintexas.gov/department/gis-data
- **API?**: YES — ArcGIS REST API with JSON/GeoJSON; GeoHub downloads
- **Data format**: JSON, GeoJSON via REST; CSV, KML, Shapefile, GeoTIFF via Hub

### Zoning Map / Lookup
- **Austin Property Profile (interactive map)**: https://maps.austintexas.gov/GIS/PropertyProfile/
- **Zoning By Address (Open Data)**: https://data.austintexas.gov/Building-and-Development/Zoning-By-Address/nbzi-qabm
  - Socrata dataset — queryable via SODA API

### Municipal Code
- **Austin Land Development Code**: https://library.municode.com/tx/austin/codes/land_development_code
- **Austin Code of Ordinances**: https://library.municode.com/tx/austin/codes/code_of_ordinances

### Notes
- Travis County has solid ArcGIS REST API access for parcels (JSON/GeoJSON).
- Austin's "Zoning By Address" dataset on Socrata is a major asset — provides zoning by address via API.
- TCAD parcel data updated monthly.
- Multiple ArcGIS REST endpoints available from both county and city.

---

## 16. Aggregator Sites & Open Data Projects

### Commercial Aggregators

| Provider | Coverage | Free Tier | API | Notes |
|----------|----------|-----------|-----|-------|
| **Regrid** (fka Loveland) | Nationwide US + Canada | Free parcel boundaries via Esri ecosystem; limited attributes | Yes (paid, starting ~$80K/yr for full data) | Most comprehensive. 155M+ parcels. Standard schema includes owner, use code, acreage, address |
| **Regrid (Academic/Nonprofit)** | Same | Free bulk snapshot for qualifying orgs | Same API | "Data With Purpose" program — worth applying if your use case qualifies |
| **ParcelQuest** | California-focused | 25 free searches/month | No public API | Assessor data vendor for CA counties |
| **DataTree (First American)** | Nationwide | No free tier | Enterprise API | Title + assessor + deed data |
| **CoreLogic** | Nationwide | No free tier | Enterprise API | Industry standard but expensive |
| **ATTOM Data** | Nationwide | Limited free; paid plans from ~$100/mo | REST API | Property data, AVM, hazard, demographics |

### Open / Free Data Sources

| Source | What It Provides | Format | Notes |
|--------|-----------------|--------|-------|
| **data.gov** (parcel tag) | Index of county/state parcel datasets | Varies | https://catalog.data.gov/dataset/?tags=parcels — links to source portals, not a unified database |
| **OpenStreetMap** | Building footprints, some land use | OSM XML / GeoJSON | Does NOT contain parcel boundaries. Community consensus is parcels don't belong in OSM |
| **Open Parcel Project** | Aspiration to build a free nationwide parcel DB | N/A | https://openparceldata.wordpress.com/ — largely dormant; concept never fully materialized |
| **OpenAddresses** | Address point data (no parcel polygons) | CSV / GeoJSON | Good for geocoding, not for lot boundaries |
| **National Zoning Atlas** | Standardized zoning maps | GeoJSON | https://www.zoningatlas.org/ — academic project; growing state-by-state coverage |
| **State-level consolidators** | Some states consolidate county parcel data | Varies | Examples: Massachusetts, Montana, Minnesota have statewide parcel databases |
| **US Census TIGER/Line** | Census blocks, roads, water — no parcels | Shapefile | Useful for context but not parcel-level data |

### Key Takeaway on Aggregators
There is **no free nationwide parcel database** with attributes (owner, lot size, year built, etc.). The best free path is going county-by-county through their ArcGIS REST APIs and open data portals. Regrid is the closest to a commercial "one-stop shop" but pricing starts at enterprise level.

---

## 17. Summary: API Availability Matrix

| # | Market | County | ArcGIS REST API? | Socrata/SODA API? | Bulk Downloads? | Ease of Automation |
|---|--------|--------|-----------------|-------------------|-----------------|-------------------|
| 1 | Los Angeles | LA County | YES | No | No | GOOD — ArcGIS REST |
| 2 | Dallas | Dallas County | YES | No | YES (shapefiles) | GOOD |
| 2 | Dallas | Tarrant County | YES (Hub) | No | YES | GOOD |
| 3 | Seattle | King County | YES (Hub) | YES (data.kingcounty.gov) | YES (bulk CSV) | EXCELLENT |
| 4 | San Diego | San Diego County | PARTIAL (ZAPP is ArcGIS) | No | YES (SanGIS) | MODERATE |
| 5 | Phoenix | Maricopa County | YES (full REST) | No | YES (Hub) | EXCELLENT |
| 6 | Denver | Denver County | YES (Hub) | No | YES | GOOD |
| 7 | Chicago | Cook County | YES (Hub) | YES (datacatalog) | YES | EXCELLENT |
| 8 | New York | NYC | YES (MapPLUTO) | YES (PLUTO on NYC Open Data) | YES (PLUTO bulk) | EXCELLENT |
| 9 | Houston | Harris County | YES (full REST) | No | YES (PDATA/shapefiles) | EXCELLENT |
| 10 | Atlanta | Fulton County | YES (Hub) | No | YES | GOOD |
| 11 | Nashville | Davidson County | YES (full REST) | No | YES (Hub) | GOOD |
| 12 | Charlotte | Mecklenburg County | YES (full REST + Hub) | No | YES | EXCELLENT |
| 13 | Orlando | Orange County FL | YES (REST + Hub) | No | YES | GOOD |
| 14 | Tampa | Hillsborough County | YES (REST + Hub) | No | YES | GOOD |
| 15 | Austin | Travis County | YES (full REST) | YES (Zoning by Address) | YES (Hub) | EXCELLENT |

### Top Tier for Automation (structured APIs, JSON/GeoJSON, rich data)
1. **NYC** — PLUTO via Socrata is the gold standard. 80+ fields per tax lot including zoning + FAR.
2. **Cook County (Chicago)** — Socrata API + ArcGIS Hub + GitHub code. Very transparent.
3. **King County (Seattle)** — Socrata + ArcGIS Hub + bulk CSV. Triple data access.
4. **Maricopa County (Phoenix)** — Full ArcGIS REST with rich field set. Daily updates.
5. **Harris County (Houston)** — ArcGIS REST with JSON/GeoJSON + PDATA bulk downloads.
6. **Mecklenburg County (Charlotte)** — ArcGIS REST + open-source GeoPortal + Hub.
7. **Travis County (Austin)** — ArcGIS REST + Socrata zoning dataset.

### Middle Tier (ArcGIS available but may require more work)
8. **LA County** — ArcGIS REST exists but ZIMAS (zoning) is HTML-only.
9. **Dallas / Tarrant Counties** — ArcGIS services available; Tarrant Hub is good.
10. **Davidson County (Nashville)** — ArcGIS REST with 4000 record max; good Hub.
11. **Denver County** — ArcGIS datasets available; zoning data on Hub.
12. **Fulton County (Atlanta)** — ArcGIS Hub with parcels; qPublic is HTML.
13. **Orange County (Orlando)** — OCGIS Hub with GeoServices/WMS/WFS.
14. **Hillsborough County (Tampa)** — ArcGIS REST + GeoHub; daily updates.

### Lower Tier (more scraping required)
15. **San Diego County** — ParcelQuest has search limits; SanGIS data downloads require more setup.

---

## ArcGIS REST API Query Pattern (for reference)

Most county ArcGIS REST endpoints follow this pattern:

```
GET {base_url}/arcgis/rest/services/{ServiceName}/MapServer/{LayerID}/query
  ?where=1=1
  &outFields=*
  &f=json            (or f=geojson)
  &returnGeometry=true
  &resultRecordCount=1000
```

To search by address or APN, use the `where` parameter:
```
?where=SITUS_ADDR LIKE '%123 MAIN ST%'
?where=APN='1234-567-890'
```

Key considerations:
- **MaxRecordCount** varies by service (typically 1000-4000). You need pagination for bulk queries.
- **Rate limiting** is generally not strict on public endpoints but be respectful.
- Use `returnCountOnly=true` first to check dataset size before pulling full records.
- GeoJSON format (`f=geojson`) is usually the most useful for downstream processing.
