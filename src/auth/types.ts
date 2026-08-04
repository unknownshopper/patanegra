export type Role = 'mesero' | 'caja' | 'almacen' | 'gerente' | 'piso' | 'admin' | 'owner'

export type AuthUser = {
  uid: string
  email: string | null
  role: Role | null
  displayName?: string | null
  staffId?: string | null
}
