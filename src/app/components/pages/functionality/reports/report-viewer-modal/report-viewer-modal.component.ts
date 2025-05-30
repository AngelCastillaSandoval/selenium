import { Component, OnInit, Input, Output, EventEmitter, OnChanges } from "@angular/core"
import { CommonModule } from "@angular/common"
import { ReportService } from "../../../../../services/report.service"
import { ReportDto, ReportWithWorkshopsDto, ReportWorkshopDto } from "../../../../../interfaces/report.interface"
import { DomSanitizer, SafeHtml } from "@angular/platform-browser"
import Swal from "sweetalert2"

@Component({
  selector: "app-report-viewer-modal",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./report-viewer-modal.component.html",
  styleUrls: ["./report-viewer-modal.component.css"],
})
export class ReportViewerModalComponent implements OnInit, OnChanges {
  @Input() isVisible = false
  @Input() reportData: ReportDto | ReportWithWorkshopsDto | null = null
  @Output() close = new EventEmitter<void>()
  @Input() workshopDateStart: string | null = null
  @Input() workshopDateEnd: string | null = null

  showImageViewer = false
  currentImages: string[] = []
  currentImageIndex = 0

  showScheduleViewer = false
  schedulePreview = ""

  currentWorkshopIndex = 0

  // Nuevas propiedades para la carga de descripción
  descriptionContent: SafeHtml = ""
  isLoadingDescription = false

  months = [
    { value: "01", label: "Ene" },
    { value: "02", label: "Feb" },
    { value: "03", label: "Mar" },
    { value: "04", label: "Abr" },
    { value: "05", label: "May" },
    { value: "06", label: "Jun" },
    { value: "07", label: "Jul" },
    { value: "08", label: "Ago" },
    { value: "09", label: "Sep" },
    { value: "10", label: "Oct" },
    { value: "11", label: "Nov" },
    { value: "12", label: "Dic" },
  ]

  constructor(
    private reportService: ReportService,
    private sanitizer: DomSanitizer,
  ) { }

  ngOnInit(): void {
    this.processReportData()
  }

  ngOnChanges(): void {
    if (this.isVisible && this.reportData) {
      this.processReportData()
    }
  }

  // Método actualizado para devolver el contenido HTML cargado
  getSanitizedDescription(): SafeHtml {
    return this.descriptionContent
  }

  // Nuevo método para cargar el contenido HTML de la descripción
  private loadDescriptionContent(): void {
    const report = this.getSafeReport()
    if (!report.descriptionUrl) {
      this.descriptionContent = this.sanitizer.bypassSecurityTrustHtml(
        '<p class="text-gray-500 italic">Sin descripción disponible</p>',
      )
      return
    }

    this.isLoadingDescription = true

    // Si es una URL, hacer fetch para obtener el contenido
    if (report.descriptionUrl.startsWith("http")) {
      fetch(report.descriptionUrl)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
          return response.text()
        })
        .then((htmlContent) => {
          this.descriptionContent = this.sanitizer.bypassSecurityTrustHtml(htmlContent)
          this.isLoadingDescription = false
        })
        .catch((error) => {
          console.error("Error loading description:", error)
          this.descriptionContent = this.sanitizer.bypassSecurityTrustHtml(
            '<p class="text-red-500">Error al cargar la descripción</p>',
          )
          this.isLoadingDescription = false
        })
    } else if (report.descriptionUrl.includes("<") && report.descriptionUrl.includes(">")) {
      // Si ya es contenido HTML, usarlo directamente
      this.descriptionContent = this.sanitizer.bypassSecurityTrustHtml(report.descriptionUrl)
      this.isLoadingDescription = false
    } else {
      // Si es texto plano, envolverlo en un párrafo
      this.descriptionContent = this.sanitizer.bypassSecurityTrustHtml(
        `<p class="text-gray-900 dark:text-gray-100">${report.descriptionUrl}</p>`,
      )
      this.isLoadingDescription = false
    }
  }

  processReportData(): void {
    if (!this.reportData) return

    // Cargar el contenido de la descripción
    this.loadDescriptionContent()

    // Procesar cronograma
    if ("scheduleUrl" in this.reportData && this.reportData.scheduleUrl) {
      this.schedulePreview = this.processImageUrl(this.reportData.scheduleUrl)
    } else if ("report" in this.reportData && this.reportData.report.scheduleUrl) {
      this.schedulePreview = this.processImageUrl(this.reportData.report.scheduleUrl)
    }

    this.currentWorkshopIndex = 0
  }

  getWorkshops(): ReportWorkshopDto[] {
    if (!this.reportData) return []
    if ("workshops" in this.reportData) {
      return this.reportData.workshops
    }
    if ("report" in this.reportData && (this.reportData as any).report.workshops) {
      const nested = (this.reportData as any).report as ReportDto & { workshops: ReportWorkshopDto[] }
      return nested.workshops || []
    }
    return []
  }

  getCurrentWorkshop(): ReportWorkshopDto {
    const workshops = this.getWorkshops()
    return (
      workshops[this.currentWorkshopIndex] ?? {
        id: 0,
        reportId: 0,
        workshopId: 0,
        workshopName: "",
        description: "",
        imageUrl: [],
        workshopStatus: "",
        workshopDateStart: "",
        workshopDateEnd: "",
        name: "",
      }
    )
  }

  prevWorkshop(): void {
    if (this.currentWorkshopIndex > 0) {
      this.currentWorkshopIndex--
    }
  }

  nextWorkshop(): void {
    const workshops = this.getWorkshops()
    if (this.currentWorkshopIndex < workshops.length - 1) {
      this.currentWorkshopIndex++
    }
  }

  processImageUrl(url: string): string {
    if (!url) return "/assets/placeholder-image.png"

    if (url.startsWith("http") || url.startsWith("data:image")) {
      return url
    }

    if (url.startsWith("iVBOR") || url.startsWith("ASUN") || url.includes("/9j/") || url.includes("+/9k=")) {
      return `data:image/png;base64,${url}`
    }

    return "/assets/placeholder-image.png"
  }

  viewWorkshopImages(): void {
    const currentWorkshop = this.getCurrentWorkshop()
    if (!currentWorkshop || !Array.isArray(currentWorkshop.imageUrl) || currentWorkshop.imageUrl.length === 0) {
      Swal.fire({
        title: "Información",
        text: "Este taller no tiene imágenes disponibles",
        icon: "info",
        confirmButtonText: "Aceptar",
      })
      return
    }
    this.currentImages = currentWorkshop.imageUrl.map((url) => this.processImageUrl(url))
    this.currentImageIndex = 0
    this.showImageViewer = true
  }

  viewSchedule(): void {
    if (this.schedulePreview) {
      this.showScheduleViewer = true
    }
  }

  closeImageViewer(): void {
    this.showImageViewer = false
    this.currentImageIndex = 0
  }

  prevImage(): void {
    if (this.currentImageIndex > 0) {
      this.currentImageIndex--
    }
  }

  nextImage(): void {
    if (this.currentImageIndex < this.currentImages.length - 1) {
      this.currentImageIndex++
    }
  }

  closeScheduleViewer(): void {
    this.showScheduleViewer = false
  }

  downloadPdf(): void {
    if (!this.reportData) return

    let reportId: number | null = null

    if ("id" in this.reportData) {
      reportId = this.reportData.id
    } else if ("report" in this.reportData && "id" in this.reportData.report) {
      reportId = this.reportData.report.id
    }

    if (reportId) {
      Swal.fire({
        title: "Generando PDF...",
        text: "Por favor espera un momento",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading()
        },
      })

      const workshopDateStart = this.workshopDateStart
      const workshopDateEnd = this.workshopDateEnd

      this.reportService.downloadReportPdf(reportId, workshopDateStart!, workshopDateEnd!).subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.target = "_blank"
          a.download = `reporte_${reportId}.pdf`
          a.click()
          window.URL.revokeObjectURL(url)

          Swal.close()
        },
        error: (error) => {
          console.error("Error downloading PDF:", error)
          Swal.fire("Error", "No se pudo generar el PDF.", "error")
        },
      })
    }
  }

  formatDate(dateString: string | undefined): string {
    if (!dateString) return "Fecha no disponible"

    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        return "Fecha inválida"
      }

      const day = date.getDate()
      const month = this.months[date.getMonth()]?.label || "Mes"
      const year = date.getFullYear()

      return `${day}/${month}/${year}`
    } catch (error) {
      console.error("Error formatting date:", error)
      return "Fecha no disponible"
    }
  }

  closeModal(): void {
    // Limpiar los campos
    this.currentWorkshopIndex = 0
    this.currentImageIndex = 0
    this.currentImages = []
    this.showImageViewer = false
    this.showScheduleViewer = false
    this.descriptionContent = ""
    this.isLoadingDescription = false

    // Emitir evento de cierre
    this.close.emit()
  }

  getSafeReport(): ReportDto {
    if (!this.reportData) {
      return {
        id: 0,
        year: 0,
        trimester: "",
        descriptionUrl: "",
        scheduleUrl: "",
        status: "",
      }
    }

    return "report" in this.reportData ? this.reportData.report : this.reportData
  }
}
