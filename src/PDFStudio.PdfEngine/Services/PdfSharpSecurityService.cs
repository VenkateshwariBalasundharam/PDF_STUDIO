using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;
using PdfSharp.Pdf.Security;
using PDFStudio.Application.Engines;

namespace PDFStudio.PdfEngine.Services;

public sealed class PdfSharpSecurityService : IPdfSecurityService
{
    public Task<byte[]> ProtectAsync(
        byte[] document,
        PdfProtectionOptions options,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        using var inStream = new MemoryStream(document);
        using var pdfDocument = PdfReader.Open(inStream, PdfDocumentOpenMode.Modify);

        var securityHandler = pdfDocument.SecuritySettings;

        if (!string.IsNullOrEmpty(options.UserPassword))
        {
            securityHandler.UserPassword = options.UserPassword;
        }

        if (!string.IsNullOrEmpty(options.OwnerPassword))
        {
            securityHandler.OwnerPassword = options.OwnerPassword;
        }

        securityHandler.PermitPrint = options.AllowPrinting;
        securityHandler.PermitModifyDocument = options.AllowModifying;
        securityHandler.PermitExtractContent = options.AllowCopying;

        using var outStream = new MemoryStream();
        pdfDocument.Save(outStream);
        return Task.FromResult(outStream.ToArray());
    }
}

