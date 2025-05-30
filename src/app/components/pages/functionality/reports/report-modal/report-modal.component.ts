import { ActivityService } from "./../../../../../services/ui/activity.service"
import { ImageProcessingService } from "./../../../../../services/ui/image-processing.service"
import { SupabaseService } from "./../../../../../services/ui/supabase.service"
import { ReportService } from "../../../../../services/report.service"
import { Component, OnInit, Input, Output, EventEmitter, SimpleChanges, OnDestroy } from "@angular/core"
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  AbstractControl,
  ValidationErrors,
  ValidatorFn,
} from "@angular/forms"
import { RouterModule } from "@angular/router"
import { CommonModule } from "@angular/common"
import Swal from "sweetalert2"
import {
  ImageUrl,
  ReportDto,
  ReportWithWorkshopsDto,
  ReportWorkshopDto,
  WorkshopKafkaEventDto,
} from "../../../../../interfaces/report.interface"
import { QuillModule } from "ngx-quill"
import { AuthService } from "../../../../../auth/services/auth.service"
import { debounceTime, distinctUntilChanged } from "rxjs/operators"
import { Subject } from "rxjs"

export function dateRangeValidator(): ValidatorFn {
  return (formGroup: AbstractControl): ValidationErrors | null => {
    const workshopDateStart = formGroup.get("workshopDateStart")?.value
    const workshopDateEnd = formGroup.get("workshopDateEnd")?.value
    if (!workshopDateStart || !workshopDateEnd) return null
    const start = new Date(workshopDateStart)
    const end = new Date(workshopDateEnd)
    return end < start ? { invalidDateRange: true } : null
  }
}

export function yearValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value
    if (!value) return { required: true }

    const currentYear = new Date().getFullYear()
    const year = Number.parseInt(value)

    if (isNaN(year)) return { invalidYear: true }
    if (year < 2020) return { yearTooOld: true }
    if (year > currentYear + 1) return { yearTooFuture: true }

    return null
  }
}

@Component({
  selector: "app-report-modal",
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, CommonModule, RouterModule, QuillModule],
  templateUrl: "./report-modal.component.html",
  styleUrl: "./report-modal.component.css",
})
export class ReportModalComponent implements OnInit, OnDestroy {
  @Input() reportData: ReportDto | ReportWithWorkshopsDto | null = null
  @Input() isVisible = false
  @Output() close = new EventEmitter<void>()
  @Output() saved = new EventEmitter<ReportWithWorkshopsDto>()

  allWorkshops: WorkshopKafkaEventDto[] = []
  workshopSuggestions: WorkshopKafkaEventDto[][] = []
  showSuggestions: boolean[] = []

  reportForm: FormGroup
  isEditMode = false
  isSubmitting = false
  isLoadingDescription = false
  scheduleFileName = ""
  scheduleFile: File | null = null
  schedulePreview = ""

  // Variables para validación de duplicidad
  isDuplicateReport = false
  isCheckingDuplicate = false
  duplicateCheckSubject = new Subject<{ year: number; trimester: string }>()

  // Variables para manejar archivos anteriores en edición
  previousScheduleUrl = ""
  previousDescriptionUrl = ""
  previousImageUrls: string[][] = []

  workshopImages: ImageUrl[][] = []

  showImageViewer = false
  currentWorkshopImages: ImageUrl[] = []
  currentImageIndex = 0
  currentImageUrl = ""

  showScheduleViewer = false

  // Propiedades para el año
  currentYear = new Date().getFullYear()
  maxYear = new Date().getFullYear() + 1
  minYear = 2020

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
    private fb: FormBuilder,
    private reportService: ReportService,
    private supabaseService: SupabaseService,
    private imageProcessingService: ImageProcessingService,
    private activityService: ActivityService,
    private authService: AuthService,
  ) {
    this.reportForm = this.createReportForm()
    this.setupDuplicateValidation()
  }

  ngOnInit(): void {
    this.loadWorkshops()
    this.setupFormSubscriptions()
  }

  ngOnDestroy(): void {
    // Limpiar suscripciones
    this.duplicateCheckSubject.complete()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["isVisible"]) {
      if (changes["isVisible"].currentValue === true) {
        // Modal se está abriendo
        this.initializeModal()
      } else if (changes["isVisible"].currentValue === false) {
        // Modal se está cerrando
        this.resetModalCompletely()
      }
    }

    if (changes["reportData"] && changes["reportData"].currentValue && this.isVisible) {
      this.populateForm(changes["reportData"].currentValue)
    }
  }

  // Método para inicializar el modal cuando se abre
  initializeModal(): void {
    console.log("🔄 Inicializando modal...")

    // Si hay datos de reporte, es modo edición
    if (this.reportData) {
      console.log("📝 Modo edición detectado")
      this.populateForm(this.reportData)
    } else {
      console.log("➕ Modo creación detectado")
      // Modo creación - asegurar que todo esté limpio
      this.resetModalCompletely()
      this.isEditMode = false
    }
  }

  // Método mejorado para resetear completamente el modal
  resetModalCompletely(): void {
    console.log("🧹 Reseteando modal completamente...")

    // Resetear formulario
    this.reportForm.reset()
    this.reportForm = this.createReportForm()

    // Limpiar arrays y objetos
    this.workshopImages = []
    this.workshopSuggestions = []
    this.showSuggestions = []

    // Limpiar archivos
    this.scheduleFileName = ""
    this.scheduleFile = null
    this.schedulePreview = ""

    // Limpiar URLs anteriores
    this.previousScheduleUrl = ""
    this.previousDescriptionUrl = ""
    this.previousImageUrls = []

    // Resetear estados
    this.isLoadingDescription = false
    this.isDuplicateReport = false
    this.isCheckingDuplicate = false
    this.isEditMode = false
    this.isSubmitting = false

    // Cerrar visores
    this.showImageViewer = false
    this.showScheduleViewer = false

    // Limpiar imágenes actuales
    this.currentWorkshopImages = []
    this.currentImageIndex = 0
    this.currentImageUrl = ""

    // Limpiar FormArray de talleres
    while (this.workshopsArray.length !== 0) {
      this.workshopsArray.removeAt(0)
    }

    console.log("✅ Modal reseteado completamente")
  }

  setupDuplicateValidation(): void {
    // Configurar debounce para validación de duplicidad
    this.duplicateCheckSubject
      .pipe(
        debounceTime(800), // Esperar 800ms después del último cambio
        distinctUntilChanged((prev, curr) => prev.year === curr.year && prev.trimester === curr.trimester),
      )
      .subscribe(({ year, trimester }) => {
        this.checkDuplicateReportRealTime(year, trimester)
      })
  }

  setupFormSubscriptions(): void {
    // Suscribirse a cambios en año y trimestre
    this.reportForm.get("year")?.valueChanges.subscribe(() => {
      this.onYearOrTrimesterChange()
    })

    this.reportForm.get("trimester")?.valueChanges.subscribe(() => {
      this.onYearOrTrimesterChange()
    })
  }

  onYearOrTrimesterChange(): void {
    const year = this.reportForm.get("year")?.value
    const trimester = this.reportForm.get("trimester")?.value

    // Resetear estado de duplicidad
    this.isDuplicateReport = false

    if (year && trimester) {
      // Validar que el año sea válido antes de verificar duplicidad
      const yearControl = this.reportForm.get("year")
      if (yearControl?.valid) {
        this.duplicateCheckSubject.next({ year: Number(year), trimester })
      }
    }

    // Actualizar fechas de talleres
    this.updateWorkshopDates()
  }

  async checkDuplicateReportRealTime(year: number, trimester: string): Promise<void> {
    // No verificar si estamos editando el mismo reporte
    if (this.isEditMode && this.reportData) {
      const currentReport = "report" in this.reportData ? this.reportData.report : this.reportData
      if (currentReport.year === year && currentReport.trimester === trimester) {
        this.isDuplicateReport = false
        return
      }
    }

    this.isCheckingDuplicate = true

    try {
      // Usar el servicio correctamente
      const exists = await this.reportService.checkReportExists(year, trimester).toPromise()
      this.isDuplicateReport = exists === true

      if (this.isDuplicateReport) {
        this.showDuplicateNotification(year, trimester)

        // Marcar el formulario como inválido cuando hay duplicidad
        this.reportForm.get("year")?.setErrors({ duplicate: true })
        this.reportForm.get("trimester")?.setErrors({ duplicate: true })
      } else {
        // Limpiar errores de duplicidad si no hay duplicidad
        const yearControl = this.reportForm.get("year")
        const trimesterControl = this.reportForm.get("trimester")

        if (yearControl?.errors?.["duplicate"]) {
          delete yearControl.errors["duplicate"]
          if (Object.keys(yearControl.errors).length === 0) {
            yearControl.setErrors(null)
          }
        }

        if (trimesterControl?.errors?.["duplicate"]) {
          delete trimesterControl.errors["duplicate"]
          if (Object.keys(trimesterControl.errors).length === 0) {
            trimesterControl.setErrors(null)
          }
        }
      }
    } catch (error) {
      console.error("Error al verificar duplicidad:", error)
      this.isDuplicateReport = false
    } finally {
      this.isCheckingDuplicate = false
    }
  }

  showDuplicateNotification(year: number, trimester: string): void {
    const Toast = Swal.mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 6000,
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.addEventListener("mouseenter", Swal.stopTimer)
        toast.addEventListener("mouseleave", Swal.resumeTimer)
      },
    })

    Toast.fire({
      icon: "warning",
      title: "⚠️ Reporte Duplicado",
      html: `
        <div style="text-align: left; font-size: 14px;">
          <p><strong>Ya existe un reporte para:</strong></p>
          <p>📅 <strong>Año:</strong> ${year}</p>
          <p>📊 <strong>Trimestre:</strong> ${trimester}</p>
          <br>
          <p style="color: #d97706;">💡 <strong>Sugerencia:</strong> Cambia el año o trimestre para evitar duplicidad.</p>
        </div>
      `,
      background: "#fef3c7",
      color: "#92400e",
    })
  }

  loadWorkshops() {
    this.reportService.listWorkshopCache("A").subscribe((data) => {
      this.allWorkshops = data
    })
  }

  onWorkshopNameInput(index: number) {
    const inputValue = this.workshopsArray.at(index).get("workshopName")?.value || ""
    const matches = this.allWorkshops.filter((w) => w.name.toLowerCase().includes(inputValue.toLowerCase()))
    this.workshopSuggestions[index] = matches
    this.showSuggestions[index] = true
  }

  hideAutocompleteDelayed(index: number) {
    setTimeout(() => {
      this.showSuggestions[index] = false
    }, 200)
  }

  selectWorkshopSuggestion(index: number, workshops: WorkshopKafkaEventDto) {
    const group = this.workshopsArray.at(index)
    group.patchValue({
      workshopName: workshops.name,
      workshopId: workshops.id,
      workshopDateStart: workshops.dateStart,
      workshopDateEnd: workshops.dateEnd,
    })
    group.get("workshopDateStart")?.disable()
    group.get("workshopDateEnd")?.disable()
    this.workshopSuggestions[index] = []
    this.showSuggestions[index] = false
  }

  onWorkshopNameBlur(index: number): void {
    const group = this.workshopsArray.at(index)
    const currentName = group.get("workshopName")?.value
    const selectedWorkshop = this.allWorkshops.find((w) => w.name.toLowerCase() === currentName.toLowerCase())

    if (selectedWorkshop) {
      group.patchValue({
        workshopId: selectedWorkshop.id,
        workshopDateStart: selectedWorkshop.dateStart,
        workshopDateEnd: selectedWorkshop.dateEnd,
      })

      group.get("workshopDateStart")?.disable()
      group.get("workshopDateEnd")?.disable()
    } else {
      group.patchValue({
        workshopId: null,
      })

      group.get("workshopDateStart")?.enable()
      group.get("workshopDateEnd")?.enable()
    }
  }

  createReportForm(): FormGroup {
    return this.fb.group({
      id: [null],
      year: [null, [Validators.required, yearValidator()]],
      trimester: [null, Validators.required],
      description: ["", Validators.required],
      schedule: [""],
      workshops: this.fb.array([]),
    })
  }

  get workshopsArray(): FormArray {
    return this.reportForm.get("workshops") as FormArray
  }

  createWorkshopFormGroup(workshops: ReportWorkshopDto | null = null): FormGroup {
    return this.fb.group(
      {
        workshopId: [workshops?.workshopId ?? null],
        workshopName: [workshops?.workshopName ?? "", Validators.required],
        description: [workshops?.description ?? ""],
        workshopDateStart: [workshops?.workshopDateStart ?? "", Validators.required],
        workshopDateEnd: [workshops?.workshopDateEnd ?? "", Validators.required],
        imageUrl: [workshops?.imageUrl ?? []],
      },
      { validators: dateRangeValidator() },
    )
  }

  addWorkshop(): void {
    this.workshopsArray.push(this.createWorkshopFormGroup())
    this.workshopImages.push([])
    this.workshopSuggestions.push([])
    this.showSuggestions.push(false)

    setTimeout(() => {
      const items = document.querySelectorAll(".workshop-item")
      if (items.length) items[items.length - 1].scrollIntoView({ behavior: "smooth", block: "center" })
    }, 100)
  }

  resetForm(): void {
    this.reportForm = this.createReportForm()
    this.workshopImages = []
    this.scheduleFileName = ""
    this.scheduleFile = null
    this.schedulePreview = ""
    this.previousScheduleUrl = ""
    this.previousDescriptionUrl = ""
    this.previousImageUrls = []
    this.isLoadingDescription = false
    this.isDuplicateReport = false
    this.isCheckingDuplicate = false
  }

  // Función mejorada para cargar contenido HTML
  async loadHtmlContent(url: string): Promise<string> {
    try {
      console.log("🔄 Cargando contenido HTML desde:", url)
      this.isLoadingDescription = true

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      })

      if (response.ok) {
        const htmlContent = await response.text()
        console.log("✅ Contenido HTML cargado exitosamente")
        this.isLoadingDescription = false
        return htmlContent
      } else {
        console.error("❌ Error al cargar HTML:", response.status, response.statusText)
        this.isLoadingDescription = false
        return ""
      }
    } catch (error) {
      console.error("❌ Error al cargar contenido HTML:", error)
      this.isLoadingDescription = false

      // Mostrar mensaje de error al usuario
      Swal.fire({
        title: "Error al cargar descripción",
        text: "No se pudo cargar el contenido de la descripción. Puede continuar editando con contenido vacío.",
        icon: "warning",
        confirmButtonText: "Continuar",
      })

      return ""
    }
  }

  async populateForm(reportDataInput: ReportWithWorkshopsDto | ReportDto): Promise<void> {
    console.log("📝 Poblando formulario en modo edición...")
    this.isEditMode = true

    let report: ReportDto
    let workshops: ReportWorkshopDto[] = []

    if ("report" in reportDataInput) {
      report = reportDataInput.report
      workshops = reportDataInput.workshops || []
    } else {
      report = reportDataInput
    }

    // Guardar URLs anteriores para eliminar en caso de edición
    this.previousScheduleUrl = report.scheduleUrl || ""
    this.previousDescriptionUrl = report.descriptionUrl || ""

    // Cargar contenido HTML si existe la URL
    let descriptionContent = ""
    if (report.descriptionUrl && report.descriptionUrl.trim() !== "") {
      console.log("🔄 Iniciando carga de descripción HTML...")
      descriptionContent = await this.loadHtmlContent(report.descriptionUrl)

      if (!descriptionContent) {
        console.log("⚠️ No se pudo cargar el contenido, usando contenido vacío")
      }
    } else {
      console.log("ℹ️ No hay URL de descripción, usando contenido vacío")
    }

    // Poblar el formulario con los datos
    this.reportForm.patchValue({
      id: report.id,
      year: report.year,
      trimester: report.trimester,
      description: descriptionContent, // Ahora contiene el HTML del archivo, no la URL
      schedule: report.scheduleUrl,
    })

    if (report.scheduleUrl) {
      this.scheduleFileName = "Cronograma existente.jpg"
      this.schedulePreview = this.getImagePreview(report.scheduleUrl)
    }

    this.workshopsArray.clear()
    this.workshopImages = []
    this.previousImageUrls = []

    workshops.forEach((w, index) => {
      this.workshopsArray.push(this.createWorkshopFormGroup(w))
      this.workshopImages[index] = []
      this.previousImageUrls[index] = w.imageUrl || []

      if (w.imageUrl?.length > 0) {
        w.imageUrl.forEach((url: string, imgIndex: number) => {
          this.workshopImages[index].push({
            file: null,
            preview: this.getImagePreview(url),
            name: `Imagen ${imgIndex + 1}`,
          })
        })
      }
    })

    console.log("✅ Formulario poblado exitosamente")
  }

  getImagePreview(imageData: string): string {
    if (imageData.startsWith("http")) {
      return imageData
    }

    if (imageData.startsWith("data:image")) {
      return imageData
    }

    if (
      imageData.startsWith("iVBOR") ||
      imageData.startsWith("ASUN") ||
      imageData.includes("/9j/") ||
      imageData.includes("+/9k=")
    ) {
      return `data:image/png;base64,${imageData}`
    }

    return "/assets/placeholder-image.png"
  }

  removeWorkshop(index: number): void {
    Swal.fire({
      title: "¿Está seguro?",
      text: "¿Desea eliminar este taller?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    }).then((result) => {
      if (result.isConfirmed) {
        this.workshopsArray.removeAt(index)
        this.workshopImages.splice(index, 1)
        if (this.previousImageUrls[index]) {
          this.previousImageUrls.splice(index, 1)
        }
      }
    })
  }

  async onScheduleFileChange(event: any): Promise<void> {
    const files = event.target.files
    if (files && files.length > 0) {
      const file = files[0]

      if (!file.type.startsWith("image/")) {
        Swal.fire({
          title: "Error",
          text: "El cronograma debe ser una imagen (JPG, PNG, etc.)",
          icon: "error",
          confirmButtonText: "Aceptar",
        })
        event.target.value = ""
        return
      }

      Swal.fire({
        title: "Procesando imagen",
        text: "Convirtiendo y optimizando...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading()
        },
      })

      try {
        const processedImage = await this.imageProcessingService.processImage(file)

        this.scheduleFile = processedImage.file
        this.scheduleFileName = processedImage.name
        this.schedulePreview = processedImage.preview

        Swal.close()
      } catch (error) {
        Swal.fire({
          title: "Error",
          text: "Ocurrió un error al procesar la imagen",
          icon: "error",
          confirmButtonText: "Aceptar",
        })
      }
    } else {
      this.scheduleFile = null
      this.scheduleFileName = ""
      this.schedulePreview = ""
    }

    event.target.value = ""
  }

  viewSchedule(): void {
    if (this.schedulePreview) {
      this.showScheduleViewer = true
    }
  }

  closeScheduleViewer(): void {
    this.showScheduleViewer = false
  }

  async onImageFileChange(event: any, workshopIndex: number): Promise<void> {
    const files = event.target.files
    if (!files || files.length === 0) return

    if (!this.workshopImages[workshopIndex]) {
      this.workshopImages[workshopIndex] = []
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.type.startsWith("image/")) {
        Swal.fire({
          title: "Error",
          text: "Solo se permiten archivos de imagen (JPG, PNG, etc.)",
          icon: "error",
          confirmButtonText: "Aceptar",
        })
        event.target.value = ""
        return
      }
    }

    Swal.fire({
      title: "Procesando imágenes",
      text: "Convirtiendo y optimizando...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading()
      },
    })

    try {
      const processedImages = await this.imageProcessingService.processMultipleImages(Array.from(files))

      processedImages.forEach((processedImage) => {
        this.workshopImages[workshopIndex].push(processedImage)
      })

      Swal.close()
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: "Ocurrió un error al procesar las imágenes",
        icon: "error",
        confirmButtonText: "Aceptar",
      })
    }

    event.target.value = ""
  }

  removeImage(workshopIndex: number, imageIndex: number): void {
    this.workshopImages[workshopIndex].splice(imageIndex, 1)
  }

  openImageViewer(workshopIndex: number, imageIndex: number): void {
    this.currentWorkshopImages = this.workshopImages[workshopIndex]
    this.currentImageIndex = imageIndex
    this.currentImageUrl = this.currentWorkshopImages[imageIndex].preview
    this.showImageViewer = true
  }

  closeImageViewer(): void {
    this.showImageViewer = false
    this.currentWorkshopImages = []
    this.currentImageIndex = 0
    this.currentImageUrl = ""
  }

  viewImage(index: number): void {
    this.currentImageIndex = index
    this.currentImageUrl = this.currentWorkshopImages[index].preview
  }

  prevImage(): void {
    if (this.currentImageIndex > 0) {
      this.currentImageIndex--
      this.currentImageUrl = this.currentWorkshopImages[this.currentImageIndex].preview
    }
  }

  nextImage(): void {
    if (this.currentImageIndex < this.currentWorkshopImages.length - 1) {
      this.currentImageIndex++
      this.currentImageUrl = this.currentWorkshopImages[this.currentImageIndex].preview
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return ""

    const [year, month, day] = dateString.split("-").map(Number)
    const date = new Date(year, month - 1, day)

    const dayStr = String(date.getDate()).padStart(2, "0")
    const monthStr = this.months[date.getMonth()].label
    const yearStr = date.getFullYear()

    return `${dayStr}/${monthStr}/${yearStr}`
  }

  getDateRangeForTrimester(trimester: string, year: number): { startMonth: string; endMonth: string } {
    switch (trimester) {
      case "Enero-Marzo":
        return { startMonth: "01", endMonth: "03" }
      case "Abril-Junio":
        return { startMonth: "04", endMonth: "06" }
      case "Julio-Septiembre":
        return { startMonth: "07", endMonth: "09" }
      case "Octubre-Diciembre":
        return { startMonth: "10", endMonth: "12" }
      default:
        return { startMonth: "01", endMonth: "12" }
    }
  }

  updateWorkshopDates(): void {
    const year = this.reportForm.get("year")?.value
    const trimester = this.reportForm.get("trimester")?.value

    if (year && trimester) {
      const { startMonth, endMonth } = this.getDateRangeForTrimester(trimester, year)

      for (let i = 0; i < this.workshopsArray.length; i++) {
        const workshops = this.workshopsArray.at(i) as FormGroup

        if (!workshops.get("workshopDateStart")?.value || !workshops.get("workshopDateEnd")?.value) {
          workshops.patchValue({
            workshopDateStart: `${year}-${startMonth}-01`,
            workshopDateEnd: `${year}-${endMonth}-${new Date(year, Number.parseInt(endMonth), 0).getDate()}`,
          })
        }
      }
    }
  }

  validateWorkshopImages(): boolean {
    let valid = true

    for (let i = 0; i < this.workshopsArray.length; i++) {
      if (!this.workshopImages[i] || this.workshopImages[i].length === 0) {
        Swal.fire({
          title: "Error de validación",
          text: `El taller #${i + 1} debe tener al menos una imagen`,
          icon: "error",
          confirmButtonText: "Aceptar",
        })
        valid = false
        break
      }
    }

    return valid
  }

  shouldShowSchedule(): boolean {
    return this.reportForm.get("trimester")?.value === "Enero-Marzo"
  }

  async checkDuplicateReport(): Promise<boolean> {
    const year = this.reportForm.get("year")?.value
    const trimester = this.reportForm.get("trimester")?.value

    if (!year || !trimester) {
      return false
    }

    if (this.isEditMode && this.reportData) {
      const currentReport = "report" in this.reportData ? this.reportData.report : this.reportData
      if (currentReport.year === year && currentReport.trimester === trimester) {
        return false
      }
    }

    const exists = await this.reportService.checkReportExists(year, trimester).toPromise()
    return exists ?? false
  }

  // Función para crear archivo HTML y subirlo a Supabase
  async uploadDescriptionAsHtml(htmlContent: string): Promise<string | null> {
    try {
      const htmlBlob = new Blob([htmlContent], { type: "text/html" })
      const fileName = `description_${Date.now()}.html`
      const htmlFile = new File([htmlBlob], fileName, { type: "text/html" })

      const uploadedUrl = await this.supabaseService.uploadImage(htmlFile, "reports/html")
      return uploadedUrl
    } catch (error) {
      console.error("Error al subir descripción HTML:", error)
      return null
    }
  }

  // Función para eliminar archivos anteriores de Supabase
  async deleteOldFiles(): Promise<void> {
    try {
      // Eliminar cronograma anterior si existe
      if (this.previousScheduleUrl && this.scheduleFile) {
        const schedulePath = this.extractPathFromUrl(this.previousScheduleUrl)
        if (schedulePath) {
          await this.supabaseService.deleteImage(schedulePath)
        }
      }

      // Eliminar descripción anterior si existe
      if (this.previousDescriptionUrl) {
        const descriptionPath = this.extractPathFromUrl(this.previousDescriptionUrl)
        if (descriptionPath) {
          await this.supabaseService.deleteImage(descriptionPath)
        }
      }

      // Eliminar imágenes anteriores de talleres si se han cambiado
      for (let i = 0; i < this.previousImageUrls.length; i++) {
        const previousUrls = this.previousImageUrls[i] || []
        const currentImages = this.workshopImages[i] || []

        // Si hay nuevas imágenes, eliminar las anteriores
        const hasNewImages = currentImages.some((img) => img.file !== null)
        if (hasNewImages && previousUrls.length > 0) {
          for (const url of previousUrls) {
            const imagePath = this.extractPathFromUrl(url)
            if (imagePath) {
              await this.supabaseService.deleteImage(imagePath)
            }
          }
        }
      }
    } catch (error) {
      console.error("Error al eliminar archivos anteriores:", error)
    }
  }

  // Función auxiliar para extraer el path de una URL de Supabase
  extractPathFromUrl(url: string): string | null {
    try {
      const urlParts = url.split("/storage/v1/object/public/")
      if (urlParts.length > 1) {
        const pathParts = urlParts[1].split("/")
        pathParts.shift() // Remover el nombre del bucket
        return pathParts.join("/")
      }
      return null
    } catch (error) {
      console.error("Error al extraer path de URL:", error)
      return null
    }
  }

  async saveReport(): Promise<void> {
    // Validar formulario básico
    if (this.reportForm.invalid) {
      this.markFormGroupTouched(this.reportForm)

      const yearControl = this.reportForm.get("year")
      if (yearControl?.errors) {
        let errorMessage = "Por favor complete todos los campos requeridos"

        if (yearControl.errors["required"]) {
          errorMessage = "El año es requerido"
        } else if (yearControl.errors["invalidYear"]) {
          errorMessage = "Por favor ingrese un año válido"
        } else if (yearControl.errors["yearTooOld"]) {
          errorMessage = "El año debe ser mayor o igual a 2020"
        } else if (yearControl.errors["yearTooFuture"]) {
          errorMessage = "El año no puede ser mayor al año actual + 1"
        } else if (yearControl.errors["duplicate"]) {
          errorMessage = "Ya existe un reporte para este año y trimestre"
        }

        Swal.fire({
          title: "Error de validación",
          text: errorMessage,
          icon: "warning",
          confirmButtonText: "Aceptar",
        })
        return
      }

      Swal.fire({
        title: "Formulario incompleto",
        text: "Por favor complete todos los campos requeridos",
        icon: "warning",
        confirmButtonText: "Aceptar",
      })
      return
    }

    // Verificar duplicidad una vez más antes de guardar
    const year = this.reportForm.get("year")?.value
    const trimester = this.reportForm.get("trimester")?.value

    if (year && trimester) {
      try {
        // Verificar duplicidad final
        const isDuplicate = await this.checkFinalDuplicateReport(year, trimester)

        if (isDuplicate) {
          Swal.fire({
            title: "⚠️ Reporte Duplicado",
            html: `
            <div style="text-align: left;">
              <p><strong>Ya existe un reporte para:</strong></p>
              <p>📅 <strong>Año:</strong> ${year}</p>
              <p>📊 <strong>Trimestre:</strong> ${trimester}</p>
              <br>
              <p style="color: #d97706;"><strong>💡 Sugerencia:</strong> Cambia el año o trimestre para evitar duplicidad.</p>
            </div>
          `,
            icon: "error",
            confirmButtonText: "Entendido",
            confirmButtonColor: "#d33",
          })
          return
        }
      } catch (error) {
        console.error("Error al verificar duplicidad final:", error)
        Swal.fire({
          title: "Error",
          text: "Error al verificar duplicidad. Intente nuevamente.",
          icon: "error",
          confirmButtonText: "Aceptar",
        })
        return
      }
    }

    // Validar fechas de talleres
    let fechasInvalidas = false
    for (let i = 0; i < this.workshopsArray.length; i++) {
      const workshop = this.workshopsArray.at(i) as FormGroup
      if (workshop.errors?.["invalidDateRange"]) {
        fechasInvalidas = true
        break
      }
    }

    if (fechasInvalidas) {
      Swal.fire({
        title: "Fechas inválidas",
        text: "La fecha de fin debe ser posterior a la de inicio.",
        icon: "error",
        confirmButtonText: "Aceptar",
      })
      return
    }

    // Validar imágenes de talleres
    if (!this.validateWorkshopImages()) return

    // Continuar con el guardado...
    this.isSubmitting = true

    Swal.fire({
      title: this.isEditMode ? "Editando reporte..." : "Guardando reporte...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading()
      },
    })

    try {
      const formValue = this.reportForm.value

      // Eliminar archivos anteriores si estamos editando
      if (this.isEditMode) {
        await this.deleteOldFiles()
      }

      // Subir descripción como archivo HTML
      const descriptionHtml = formValue.description
      const descriptionUrl = await this.uploadDescriptionAsHtml(descriptionHtml)

      if (!descriptionUrl) {
        throw new Error("Error al subir la descripción")
      }

      // Subir cronograma si hay uno nuevo
      let scheduleUrl = formValue.schedule
      if (this.scheduleFile) {
        const uploaded = await this.supabaseService.uploadImage(this.scheduleFile, "reports/schedules")
        if (uploaded) scheduleUrl = uploaded
      }

      const workshops: ReportWorkshopDto[] = []

      // Procesar talleres e imágenes
      for (let i = 0; i < this.workshopsArray.length; i++) {
        const group = this.workshopsArray.at(i)
        const images = this.workshopImages[i]

        const urls: string[] = []
        for (const img of images) {
          if (img.file) {
            const url = await this.supabaseService.uploadImage(img.file, "reports/workshops")
            if (url) urls.push(url)
          } else {
            // Si no es un archivo nuevo, mantener la URL existente
            urls.push(img.preview)
          }
        }

        workshops.push({
          ...group.value,
          imageUrl: urls,
        })
      }

      const reportPayload: ReportWithWorkshopsDto = {
        report: {
          id: formValue.id,
          year: Number.parseInt(formValue.year),
          trimester: formValue.trimester,
          descriptionUrl: descriptionUrl,
          scheduleUrl: scheduleUrl,
          status: "A",
        },
        workshops,
      }

      const save$ = this.isEditMode
        ? this.reportService.updateReportById(reportPayload.report.id, reportPayload)
        : this.reportService.newReport(reportPayload)

      save$.subscribe(
        (res) => {
          this.isSubmitting = false
          Swal.fire({
            title: this.isEditMode ? "¡Reporte editado!" : "¡Guardado correctamente!",
            icon: "success",
            confirmButtonText: "Aceptar",
          })
          this.saved.emit(res)
          this.closeModal()
        },
        (err) => {
          this.isSubmitting = false
          console.error("Error al guardar:", err)
          Swal.fire({
            title: "Error",
            text: "Ocurrió un error al guardar el reporte.",
            icon: "error",
            confirmButtonText: "Aceptar",
          })
        },
      )
    } catch (err) {
      this.isSubmitting = false
      console.error("Error inesperado:", err)
      Swal.fire({
        title: "Error",
        text: "Ocurrió un error inesperado.",
        icon: "error",
        confirmButtonText: "Aceptar",
      })
    }
  }

  async checkFinalDuplicateReport(year: number, trimester: string): Promise<boolean> {
    // No verificar si estamos editando el mismo reporte
    if (this.isEditMode && this.reportData) {
      const currentReport = "report" in this.reportData ? this.reportData.report : this.reportData
      if (currentReport.year === year && currentReport.trimester === trimester) {
        return false
      }
    }

    try {
      const exists = await this.reportService.checkReportExists(year, trimester).toPromise()
      return exists === true
    } catch (error) {
      console.error("Error al verificar duplicidad final:", error)
      throw error
    }
  }

  getYearErrorMessage(): string {
    const yearControl = this.reportForm.get("year")
    if (yearControl?.errors && yearControl.touched) {
      if (yearControl.errors["required"]) {
        return "El año es requerido"
      } else if (yearControl.errors["invalidYear"]) {
        return "Por favor ingrese un año válido"
      } else if (yearControl.errors["yearTooOld"]) {
        return "El año debe ser mayor o igual a 2020"
      } else if (yearControl.errors["yearTooFuture"]) {
        return "El año no puede ser mayor al año actual + 1"
      } else if (yearControl.errors["duplicate"]) {
        return "Ya existe un reporte para este año y trimestre"
      }
    }
    return ""
  }

  markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach((control) => {
      control.markAsTouched()

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control)
      } else if (control instanceof FormArray) {
        control.controls.forEach((ctrl) => {
          if (ctrl instanceof FormGroup) {
            this.markFormGroupTouched(ctrl)
          } else {
            ctrl.markAsTouched()
          }
        })
      }
    })
  }

  closeModal(): void {
    console.log("🚪 Cerrando modal...")

    // Emitir evento de cierre
    this.close.emit()

    // Resetear completamente el modal
    this.resetModalCompletely()
  }

  validateWorkshopDates(index: number): void {
    const workshopForm = this.workshopsArray.at(index) as FormGroup
    workshopForm.updateValueAndValidity()
  }
}
