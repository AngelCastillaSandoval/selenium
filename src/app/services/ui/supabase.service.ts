// src/app/services/supabase.service.ts
import { Injectable } from "@angular/core"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { environment } from "../../../environments/environments"

@Injectable({ providedIn: "root" })
export class SupabaseService {
    private supabase: SupabaseClient

    constructor() {
        this.supabase = createClient(environment.supabaseStorage.supabaseUrl, environment.supabaseStorage.supabaseKey)
    }

    async uploadImage(file: File, path: string): Promise<string | null> {
        const fileName = `${Date.now()}_${file.name}`
        const { data, error } = await this.supabase.storage
            .from(environment.supabaseStorage.supabaseBucket)
            .upload(`${path}/${fileName}`, file, {
                cacheControl: "3600",
                upsert: false,
            })

        if (error) {
            console.error("❌ Error al subir a Supabase:", error)
            return null
        }

        return `${this.supabase.storage.from(environment.supabaseStorage.supabaseBucket).getPublicUrl(`${path}/${fileName}`).data.publicUrl}`
    }

    // Método mejorado para eliminar archivos
    async deleteImage(path: string): Promise<boolean> {
        try {
            const { error } = await this.supabase.storage.from(environment.supabaseStorage.supabaseBucket).remove([path])

            if (error) {
                console.error("❌ Error al eliminar archivo de Supabase:", error)
                return false
            }

            console.log("✅ Archivo eliminado exitosamente:", path)
            return true
        } catch (error) {
            console.error("❌ Error inesperado al eliminar archivo:", error)
            return false
        }
    }

    // Método para subir archivos HTML específicamente
    async uploadHtmlFile(htmlContent: string, path: string): Promise<string | null> {
        try {
            const fileName = `description_${Date.now()}.html`
            const htmlBlob = new Blob([htmlContent], { type: "text/html; charset=utf-8" })
            const htmlFile = new File([htmlBlob], fileName, { type: "text/html" })

            const { data, error } = await this.supabase.storage
                .from(environment.supabaseStorage.supabaseBucket)
                .upload(`${path}/${fileName}`, htmlFile, {
                    cacheControl: "3600",
                    upsert: false,
                    contentType: "text/html",
                })

            if (error) {
                console.error("❌ Error al subir archivo HTML a Supabase:", error)
                return null
            }

            const publicUrl = this.supabase.storage
                .from(environment.supabaseStorage.supabaseBucket)
                .getPublicUrl(`${path}/${fileName}`).data.publicUrl

            console.log("✅ Archivo HTML subido exitosamente:", publicUrl)
            return publicUrl
        } catch (error) {
            console.error("❌ Error inesperado al subir archivo HTML:", error)
            return null
        }
    }
}
