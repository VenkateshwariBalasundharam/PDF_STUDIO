# Run the demo (Windows PowerShell, from the PDF_Studio folder)

1. docker compose up -d postgres          (wait until `docker compose ps` says healthy)
2. Put your connection string in src/PDFStudio.PublicApi/appsettings.Development.json and
   src/PDFStudio.PrivateApi/appsettings.Development.json:
   "ConnectionStrings": { "PostgreSQL": "Host=localhost;Port=5432;Database=pdfstudio;Username=pdfuser;Password=YOUR_PASSWORD" }
3. $env:ASPNETCORE_ENVIRONMENT="Development"
   dotnet build src/PDFStudio.PublicApi ; dotnet build src/PDFStudio.PrivateApi
4. Window 1: dotnet run --no-build --project src/PDFStudio.PublicApi  --urls http://localhost:5000
   Window 2: dotnet run --no-build --project src/PDFStudio.PrivateApi --urls http://localhost:5001
   (set $env:ASPNETCORE_ENVIRONMENT="Development" in each window first)
5. Window 3: cd src/PDFStudio.Web ; npm install ; npm start      -> http://localhost:4200

## What works in this version (Stages 1-2)
- PDF Generator, Raw HTML mode: renders a real PDF with Chromium and shows it in the preview.
- Every generated PDF is saved: file on disk (%LOCALAPPDATA%\PDFStudio\Storage) + database rows.
- Documents page lists the saved PDFs (real size) and Download returns the real file.

- Template mode: Template ID = invoice-standard (seeded, published) + JSON data -> real PDF with the template's CSS and footer.

## Not done yet (later stages)
Async/background jobs, Jobs page, Dashboard numbers, Templates page, API Keys page.
First Generate PDF click downloads Chromium (~150 MB) once. The dev-token endpoint exists only in Development.
