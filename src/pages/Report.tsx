import React from 'react'
import CierrePage from './Cierre'

export default function ReportPage() {
  React.useEffect(() => {
    document.title = 'Patanegra · Reporte'
  }, [])

  return <CierrePage />
}
