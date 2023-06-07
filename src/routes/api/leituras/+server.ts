import { json } from '@sveltejs/kit'
import { prisma } from '$lib/prisma'
import { getDateForQuery, getDateObj } from '$lib/dateUtils'

import type { RequestHandler } from './$types'
import type { Leituras_de_sensor } from '@prisma/client'

export const GET: RequestHandler = async ({ request, url }) => {
    const headers = request.headers
    if (!headers.get('key'))
        return json(
            { message: 'Sem chave de API' },
            {
                status: 403
            }
        )
    if (headers.get('key') !== '123')
        return json(
            { message: 'Chave de API errada' },
            {
                status: 403
            }
        )

    const date = url.searchParams.get('data')
    const download = url.searchParams.get('download')
    const userId = url.searchParams.get('userId')

    if (!date)
        return json(
            { message: 'Nenhuma data foi fornecida' },
            {
                status: 400
            }
        )

    const dateObj = getDateObj(date)
    if (!dateObj)
        return json(
            { message: 'Data inválida' },
            {
                status: 400
            }
        )

    const { inicioDia, fimDia } = getDateForQuery(dateObj)

    const queryRes = await prisma.leituras_de_sensor.findMany({
        where: {
            data_hora: {
                gte: inicioDia,
                lt: fimDia
            }
        },
        orderBy: {
            data_hora: 'asc'
        }
    })

    if (queryRes.length === 0)
        return json(
            { message: 'Sem dados para a data fornecida' },
            { status: 404 }
        )

    const leituras = processSensorData(queryRes, dateObj)

    if (!download) return json(leituras, { status: 200 })
    else {
        const format = download

        switch (format) {
            default:
                return json(null, { status: 400 })

            case 'json':
                return json(leituras, {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    status: 200
                })

            case 'csv':
                return json(JSONtoCSV(leituras), {
                    headers: {
                        'Content-Type': 'text/csv'
                    },
                    status: 200
                })
        }
    }
}

function processSensorData(dados: Leituras_de_sensor[], data: Date) {
    const result: Leitura = {
        data,
        horario: [],
        leituras: []
    }

    const sensorIds = new Set<number>()
    const horarios = new Set<string>()

    for (let i = 0; i < dados.length; i++) {
        const item = dados[i]
        const sensorId = item.id_sensor_de_usuario
        const time = new Date(item.data_hora)
            .toLocaleTimeString('pt-BR', { timeZone: 'UTC' })
            .slice(0, -3)

        sensorIds.add(sensorId)
        horarios.add(time)

        if (!result.leituras[sensorId]) {
            result.leituras[sensorId] = {}
            Object.keys(item.leitura as object).forEach(reading => {
                result.leituras[sensorId][reading] = []
            })
        }

        Object.entries(item.leitura as object).forEach(([reading, value]) => {
            result.leituras[sensorId][reading].push(value)
        })
    }

    result.horario = Array.from(horarios)
    sensorIds.forEach(sensorId => {
        if (!result.leituras[sensorId]) {
            result.leituras[sensorId] = {}
        }
    })

    // Convert the leituras object to an array
    result.leituras = Object.values(result.leituras)

    return result
}

function JSONtoCSV(data: Leitura) {
    const headers = ['horarios']
    const sensors = Object.keys(data.leituras)
    const rows: Array<Array<string | number>> = []

    for (const sensor in sensors) {
        const dataTypes = Object.keys(data.leituras[sensor])
        for (const dataType of dataTypes) {
            headers.push(`sensor${sensor}_${dataType}`)
        }
    }

    const horarios = data.horario
    for (const horario of horarios) {
        const row: Array<string | number> = [horario]
        for (const sensor in sensors) {
            const dataTypes = Object.keys(data.leituras[sensor])
            for (const dataType of dataTypes) {
                row.push(data.leituras[sensor][dataType][rows.length])
            }
        }
        rows.push(row)
    }

    const csv = [headers.join(',')]
        .concat(rows.map(row => row.join(',')))
        .join('\n')
    return csv
}
