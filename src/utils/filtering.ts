const transformCredits = (input: any) => {
  if (!input?.credits) return { resume: [] }

  const grouped = input.credits.reduce((acc: any, credit: any) => {
    const type = credit.type || 'Uncategorized'
    if (!acc[type]) {
      acc[type] = {
        category: type,
        category_id: uuidv4(),
        credits: [],
      }
    }

    // rename projectTitle → title
    const { projectTitle, ...rest } = credit
    acc[type].credits.push({
      title: projectTitle,
      ...rest,
    })

    return acc
  }, {})

  return {
    resume: Object.values(grouped),
  }
}

export { transformCredits }
