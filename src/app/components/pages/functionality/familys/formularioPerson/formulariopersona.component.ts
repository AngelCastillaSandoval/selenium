import {
  Component,
  EventEmitter,
  Input,
  Output,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Person } from '../../../../../interfaces/person';
import { PersonaService } from '../../../../../services/person.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-formulariopersona',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './formulariopersona.component.html',
})
export class FormulariopersonaComponent implements OnChanges {
  @Input() personToEdit: Person | null = null;
  @Input() familyId: number | undefined;
  @Output() personsCreated = new EventEmitter<Person[]>();
  @Output() formClosed = new EventEmitter<void>();

  persons: Person[] = [];
  currentPerson: Person = this.initializePerson();
  isSubmitting = false;
  showForm = true;
  editingIndex: number = -1;
  isEditMode = false;

  // Propiedades para validaciones
  validationErrors: { [key: string]: string } = {};
  touched: { [key: string]: boolean } = {};

  constructor(private personaService: PersonaService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['familyId']) {
      console.log('ID de familia recibido:', this.familyId);
    }
    if (changes['personToEdit']) {
      this.handlePersonToEdit();
    }
  }

  handlePersonToEdit() {
    if (this.personToEdit) {
      this.currentPerson = { ...this.personToEdit };
      this.showForm = true;
      this.isEditMode = true;
      // Check if this person is already in our list
      const existingIndex = this.persons.findIndex(
        (p) =>
          p.documentNumber === this.personToEdit?.documentNumber &&
          p.typeDocument === this.personToEdit?.typeDocument
      );

      if (existingIndex >= 0) {
        this.editingIndex = existingIndex;
      } else {
        this.editingIndex = -1;
      }
    } else {
      this.isEditMode = false;
    }
  }

  // Inicializacion de los datos
  initializePerson(): Person {
    return {
      name: '',
      surname: '',
      age: 0,
      birthdate: '',
      typeDocument: '',
      documentNumber: '',
      typeKinship: '',
      sponsored: 'NO',
      state: 'A',
      familyIdFamily: this.familyId ? this.familyId : 0,
    };
  }

  showAddPersonForm() {
    this.showForm = true;
    this.currentPerson = this.initializePerson();
    this.editingIndex = -1;
    this.isEditMode = false;
    this.resetValidation();
  }

  addPersonAndContinue() {
    if (this.validateForm() && this.isCurrentPersonValid()) {
      if (this.isEditMode && this.personToEdit) {
        // Si estamos editando una persona existente, mostrar confirmación
        this.confirmUpdatePerson();
      } else if (this.editingIndex >= 0) {
        // Si estamos editando en la lista temporal
        this.persons[this.editingIndex] = { ...this.currentPerson };
        this.editingIndex = -1;
      } else {
        // Agregar nueva persona a la lista temporal
        this.currentPerson.familyIdFamily = this.familyId || 0;
        this.persons.push({ ...this.currentPerson });
      }

      if (!this.isEditMode) {
        this.currentPerson = this.initializePerson();
        this.resetValidation();
      }
    }
  }

  // Método para mostrar confirmación antes de actualizar
  confirmUpdatePerson() {
    Swal.fire({
      title: '¿Estás seguro?',
      text: '¿Deseas actualizar los datos de esta persona?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, actualizar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        this.updateExistingPerson();
      } else {
        // Usuario canceló la actualización
        Swal.fire({
          title: 'Actualización cancelada',
          text: 'Los datos no han sido modificados',
          icon: 'info',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#3085d6'
        });
      }
    });
  }

  updateExistingPerson() {
    if (this.personToEdit && this.personToEdit.idPerson) {
      this.isSubmitting = true;

      this.personaService.updatePerson(this.personToEdit.idPerson, this.currentPerson).subscribe({
        next: (response) => {
          console.log('Persona actualizada exitosamente:', response);

          // Mostrar mensaje de éxito
          Swal.fire({
            title: '¡Actualización exitosa!',
            text: 'Los datos de la persona han sido actualizados correctamente',
            icon: 'success',
            confirmButtonText: 'Continuar',
            confirmButtonColor: '#28a745'
          }).then(() => {
            this.personsCreated.emit([response]);
            this.closeForm();
          });

          this.isSubmitting = false;
        },
        error: (error) => {
          console.error('Error al actualizar la persona:', error);

          // Mostrar mensaje de error
          Swal.fire({
            title: '¡Error!',
            text: 'Ocurrió un error al actualizar la persona. Por favor, verifica los datos e intenta nuevamente.',
            icon: 'error',
            confirmButtonText: 'Entendido',
            confirmButtonColor: '#dc3545'
          });

          this.isSubmitting = false;
        }
      });
    }
  }

  isCurrentPersonValid(): boolean {
    return (
      this.currentPerson.name?.trim() !== '' &&
      this.currentPerson.surname?.trim() !== '' &&
      this.currentPerson.age > 0 &&
      this.currentPerson.birthdate?.trim() !== '' &&
      this.currentPerson.typeDocument?.trim() !== '' &&
      this.currentPerson.documentNumber?.trim() !== '' &&
      this.currentPerson.typeKinship?.trim() !== ''
    );
  }

  finishAndSave() {
    if (this.isEditMode) {
      // Si estamos en modo edición, actualizar directamente
      this.addPersonAndContinue();
      return;
    }

    if (this.persons.length === 0) {
      return;
    }

    // Imprimir el ID de la familia que se está guardando
    console.log('ID de la familia:', this.familyId);

    this.isSubmitting = true;
    this.personaService.createPersons(this.persons).subscribe({
      next: (response) => {
        console.log('Personas creadas exitosamente:', response);
        this.personsCreated.emit(response);
        this.closeForm();
        setTimeout(() => {
          this.openFamilyForm();
        }, 3000);
      },
      error: (error) => {
        console.error('Error al crear las personas:', error);
        alert(
          'Ocurrió un error al crear las personas. Por favor, verifica los datos e intenta nuevamente.'
        );
        this.isSubmitting = false;
      },
    });
  }

  // Metodo para editar datos e enviar
  editPerson(index: number) {
    this.currentPerson = { ...this.persons[index] };
    this.editingIndex = index;
    this.showForm = true;
    this.resetValidation();
  }

  removePerson(index: number) {
    this.persons.splice(index, 1);
  }

  // Metodo para cierre y añadido de personas
  openFamilyForm() {
    this.formClosed.emit();
  }

  cancelForm() {
    if (this.isEditMode) {
      this.closeForm();
      return;
    }

    if (this.persons.length > 0) {
      this.showForm = false;
    }
    this.currentPerson = this.initializePerson();
    this.editingIndex = -1;
    this.resetValidation();
  }

  closeForm() {
    this.formClosed.emit();
  }

  // Nuevo método para calcular la edad automáticamente
  calculateAge() {
    if (this.currentPerson.birthdate) {
      const today = new Date();
      const birthDate = new Date(this.currentPerson.birthdate);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      this.currentPerson.age = age;
      this.validateField('birthdate');
    }
  }

  // MÉTODOS DE VALIDACIÓN
  validateField(fieldName: string): void {
    this.touched[fieldName] = true;

    switch (fieldName) {
      case 'name':
        this.validateName();
        break;
      case 'surname':
        this.validateSurname();
        break;
      case 'typeDocument':
        this.validateTypeDocument();
        break;
      case 'documentNumber':
        this.validateDocumentNumber();
        break;
      case 'birthdate':
        this.validateBirthdate();
        break;
      case 'typeKinship':
        this.validateTypeKinship();
        break;
    }
  }

  validateName(): void {
    const name = this.currentPerson.name?.trim();
    if (!name) {
      this.validationErrors['name'] = 'El nombre es obligatorio';
    } else if (name.length < 2) {
      this.validationErrors['name'] = 'El nombre debe tener al menos 2 caracteres';
    } else if (name.length > 50) {
      this.validationErrors['name'] = 'El nombre no puede exceder 50 caracteres';
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(name)) {
      this.validationErrors['name'] = 'El nombre solo puede contener letras y espacios';
    } else {
      delete this.validationErrors['name'];
    }
  }

  validateSurname(): void {
    const surname = this.currentPerson.surname?.trim();
    if (!surname) {
      this.validationErrors['surname'] = 'El apellido es obligatorio';
    } else if (surname.length < 2) {
      this.validationErrors['surname'] = 'El apellido debe tener al menos 2 caracteres';
    } else if (surname.length > 50) {
      this.validationErrors['surname'] = 'El apellido no puede exceder 50 caracteres';
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(surname)) {
      this.validationErrors['surname'] = 'El apellido solo puede contener letras y espacios';
    } else {
      delete this.validationErrors['surname'];
    }
  }

  validateTypeDocument(): void {
    if (!this.currentPerson.typeDocument) {
      this.validationErrors['typeDocument'] = 'Debe seleccionar un tipo de documento';
    } else {
      delete this.validationErrors['typeDocument'];
      // Revalidar número de documento cuando cambia el tipo
      if (this.touched['documentNumber']) {
        this.validateDocumentNumber();
      }
    }
  }

  validateDocumentNumber(): void {
    const docNumber = this.currentPerson.documentNumber?.trim();
    const docType = this.currentPerson.typeDocument;

    if (!docNumber) {
      this.validationErrors['documentNumber'] = 'El número de documento es obligatorio';
      return;
    }

    // Verificar si ya existe en la lista temporal
    const existingPerson = this.persons.find((person, index) =>
      person.documentNumber === docNumber &&
      person.typeDocument === docType &&
      index !== this.editingIndex
    );

    if (existingPerson) {
      this.validationErrors['documentNumber'] = 'Ya existe una persona con este documento';
      return;
    }

    // Validaciones específicas por tipo de documento
    switch (docType) {
      case 'DNI':
        if (!/^\d{8}$/.test(docNumber)) {
          this.validationErrors['documentNumber'] = 'El DNI debe tener exactamente 8 dígitos';
        } else {
          delete this.validationErrors['documentNumber'];
        }
        break;
      case 'CE':
        if (!/^\d{9}$/.test(docNumber)) {
          this.validationErrors['documentNumber'] = 'El Carné de Extranjería debe tener 9 dígitos';
        } else {
          delete this.validationErrors['documentNumber'];
        }
        break;
      case 'PAS':
        if (!/^[A-Z0-9]{6,9}$/.test(docNumber.toUpperCase())) {
          this.validationErrors['documentNumber'] = 'El Pasaporte debe tener entre 6 y 9 caracteres alfanuméricos';
        } else {
          delete this.validationErrors['documentNumber'];
        }
        break;
      default:
        this.validationErrors['documentNumber'] = 'Seleccione primero un tipo de documento';
    }
  }

  validateBirthdate(): void {
    if (!this.currentPerson.birthdate) {
      this.validationErrors['birthdate'] = 'La fecha de nacimiento es obligatoria';
      return;
    }

    const birthDate = new Date(this.currentPerson.birthdate);
    const today = new Date();
    const maxDate = new Date();
    maxDate.setFullYear(today.getFullYear() - 120); // Máximo 120 años

    if (birthDate > today) {
      this.validationErrors['birthdate'] = 'La fecha de nacimiento no puede ser futura';
    } else if (birthDate < maxDate) {
      this.validationErrors['birthdate'] = 'La fecha de nacimiento no puede ser mayor a 120 años';
    } else if (this.currentPerson.age < 0) {
      this.validationErrors['birthdate'] = 'La fecha de nacimiento genera una edad inválida';
    } else {
      delete this.validationErrors['birthdate'];
    }
  }

  validateTypeKinship(): void {
    if (!this.currentPerson.typeKinship) {
      this.validationErrors['typeKinship'] = 'Debe seleccionar un tipo de parentesco';
    } else {
      delete this.validationErrors['typeKinship'];
    }
  }

  validateForm(): boolean {
    // Marcar todos los campos como tocados
    this.touched = {
      name: true,
      surname: true,
      typeDocument: true,
      documentNumber: true,
      birthdate: true,
      typeKinship: true
    };

    // Validar todos los campos
    this.validateName();
    this.validateSurname();
    this.validateTypeDocument();
    this.validateDocumentNumber();
    this.validateBirthdate();
    this.validateTypeKinship();

    // Retornar si no hay errores
    return Object.keys(this.validationErrors).length === 0;
  }

  resetValidation(): void {
    this.validationErrors = {};
    this.touched = {};
  }

  hasError(fieldName: string): boolean {
    return this.touched[fieldName] && !!this.validationErrors[fieldName];
  }

  getError(fieldName: string): string {
    return this.validationErrors[fieldName] || '';
  }

  isFormValid(): boolean {
    return Object.keys(this.validationErrors).length === 0 && this.isCurrentPersonValid();
  }
}
